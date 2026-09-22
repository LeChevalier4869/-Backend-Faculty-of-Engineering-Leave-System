/**
 * Migration: เพิ่ม/แก้ไขประเภทการลา (กันยายน 2569)
 * ────────────────────────────────────────────────────────────────────────────
 * 1) เพิ่มประเภทใหม่ "ไปราชการ" — บุคลากรทุกประเภทลาได้ และ "ไม่หักวันลา"
 *    (นับจำนวนวันที่ลาแทน เหมือนลาอุปสมบท ฯลฯ) → isNonDeductible = true
 * 2) แยก "ลาไปศึกษา ฝึกอบรม ปฏิบัติการวิจัย หรือดูงาน" (เดิม) ออกเป็น 2 ประเภท
 *    - เปลี่ยนชื่อประเภทเดิม (คง id เดิม + ข้อมูลลาเก่า) → "ลาไปศึกษา"
 *    - เพิ่มประเภทใหม่ → "ลาไปฝึกอบรม ปฏิบัติการวิจัย หรือดูงาน"
 *    ทั้งสองใช้สิทธิ์/เงื่อนไข (rank) ชุดเดียวกับของเดิม
 *
 * ปลอดภัย & idempotent:
 *   - จับคู่ด้วย "ชื่อเป๊ะ" เท่านั้น, รันซ้ำได้ (ข้ามของที่มีอยู่แล้ว)
 *   - คง id ของประเภทเดิมทั้งหมด (ไม่สลับ/ไม่รีนัมเบอร์)
 *   - สร้าง rank / userRank / leaveBalance ให้ครบเพื่อให้ผู้ใช้ปัจจุบันใช้งานได้ทันที
 *     และรอบปีงบถัดไป (reset) จะ gen ยอดใหม่ได้เอง
 *
 * การใช้งาน (รันที่โฟลเดอร์ backend, ใช้ DATABASE_URL จาก .env):
 *   node scripts/migrate-leavetypes-2026-09.js            # dry-run: ตรวจอย่างเดียว ไม่เขียน
 *   node scripts/migrate-leavetypes-2026-09.js --apply    # เขียนจริง
 *
 * ⚠️  แนะนำ backup ก่อน: npm run db:backup
 */
try {
  require("dotenv").config();
} catch {
  /* env อาจถูกตั้งจากภายนอกแล้ว */
}
const prisma = require("../src/config/prisma");
const { isSexAllowedForLeaveType } = require("../src/utils/leaveGenderPolicy");

const OLD_STUDY_NAME = "ลาไปศึกษา ฝึกอบรม ปฏิบัติการวิจัย หรือดูงาน";
const STUDY_NAME = "ลาไปศึกษา";
const TRAINING_NAME = "ลาไปฝึกอบรม ปฏิบัติการวิจัย หรือดูงาน";
const OFFICIAL_NAME = "ไปราชการ";

const NEW_LEAVE_TYPES = [
  { name: TRAINING_NAME, isAvailable: false, isNonDeductible: false, resetOnFiscalYear: true },
  { name: OFFICIAL_NAME, isAvailable: false, isNonDeductible: true, resetOnFiscalYear: true },
];

let apply = false;
const log = (...a) => console.log(...a);

// ── helper: ปีงบประมาณปัจจุบัน (ค.ศ.) จาก setting; ถ้าไม่มีคำนวณแบบ 1 ต.ค. ──
async function resolveFiscalYear() {
  const s = await prisma.setting.findFirst({ where: { key: "fiscalYear" } });
  const parsed = s ? Number.parseInt(s.value, 10) : NaN;
  if (Number.isFinite(parsed)) return parsed;
  const now = new Date();
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}

// ── 1) เปลี่ยนชื่อประเภทเดิม → "ลาไปศึกษา" (คง id + ข้อมูลลาเก่า) ──
async function renameStudyType() {
  log("\n① เปลี่ยนชื่อประเภทเดิมเป็น \"ลาไปศึกษา\"");
  const old = await prisma.leaveType.findFirst({ where: { name: OLD_STUDY_NAME } });
  const already = await prisma.leaveType.findFirst({ where: { name: STUDY_NAME } });

  if (already && !old) {
    log(`   ✅ มี "${STUDY_NAME}" (id ${already.id}) อยู่แล้ว — ข้าม`);
    return already;
  }
  if (!old) {
    log(`   ⚠️  ไม่พบประเภทชื่อ "${OLD_STUDY_NAME}" และไม่พบ "${STUDY_NAME}" — โปรดตรวจชื่อในฐานข้อมูล`);
    return null;
  }
  if (already && old && already.id !== old.id) {
    log(`   ⚠️  มีทั้ง "${OLD_STUDY_NAME}" (id ${old.id}) และ "${STUDY_NAME}" (id ${already.id}) — ข้ามการเปลี่ยนชื่อเพื่อกันชื่อซ้ำ`);
    return already;
  }
  log(`   🟢 จะเปลี่ยนชื่อ id ${old.id}: "${OLD_STUDY_NAME}" → "${STUDY_NAME}"`);
  if (apply) {
    await prisma.leaveType.update({ where: { id: old.id }, data: { name: STUDY_NAME } });
    log("   ✔ เปลี่ยนชื่อแล้ว");
  }
  return { ...old, name: STUDY_NAME };
}

// ── 2) สร้างประเภทใหม่ (training + official) ──
async function ensureLeaveTypes() {
  log("\n② สร้างประเภทการลาใหม่");
  const result = {};
  for (const lt of NEW_LEAVE_TYPES) {
    const existing = await prisma.leaveType.findFirst({ where: { name: lt.name } });
    if (existing) {
      log(`   ✅ "${lt.name}" (id ${existing.id}) มีอยู่แล้ว — ข้าม`);
      result[lt.name] = existing;
    } else {
      log(`   🟢 จะสร้าง "${lt.name}" (isNonDeductible=${lt.isNonDeductible})`);
      result[lt.name] = apply ? await prisma.leaveType.create({ data: lt }) : { id: null, ...lt };
    }
  }
  return result;
}

// ── 3) สร้าง rank ของประเภทใหม่ (ต่อ personnelType) ──
// training: คัดลอกค่าจาก rank ของ "ลาไปศึกษา" ของ personnelType นั้น
// official: ทุก personnelType ลาได้ + ไม่หักวัน → receiveDays 0 / maxDays 0 / isBalance true
async function ensureRanks(studyType, trainingType, officialType) {
  log("\n③ สร้าง rank (สิทธิ์วันลา) ของประเภทใหม่");
  const personnelTypes = await prisma.personnelType.findMany();
  const created = [];

  // rank ของ "ลาไปศึกษา" เดิม (ใช้เป็นต้นแบบของ training)
  const studyRanks = studyType?.id
    ? await prisma.rank.findMany({ where: { leaveTypeId: studyType.id } })
    : [];
  const studyRankByPt = new Map(studyRanks.map((r) => [r.personnelTypeId, r]));

  for (const pt of personnelTypes) {
    // 3.1 training — ลอกจาก study ของ personnelType เดียวกัน
    if (trainingType?.id) {
      const src = studyRankByPt.get(pt.id);
      if (!src) {
        log(`   ⚠️  ${pt.name}: ไม่พบ rank ต้นแบบของ "${STUDY_NAME}" — ข้าม rank training`);
      } else {
        const rank = await ensureRank({
          personnelTypeId: pt.id,
          leaveTypeId: trainingType.id,
          minHireMonths: src.minHireMonths,
          maxHireMonths: src.maxHireMonths,
          receiveDays: src.receiveDays,
          maxDays: src.maxDays,
          isBalance: src.isBalance,
          label: `${pt.name} ${TRAINING_NAME}${src.receiveDays === 0 ? " ไม่มีสิทธิลา" : ""}`,
        });
        if (rank.created) created.push(rank.row);
      }
    }
    // 3.2 official — ทุก personnelType ลาได้ + ไม่หักวัน
    if (officialType?.id) {
      const rank = await ensureRank({
        personnelTypeId: pt.id,
        leaveTypeId: officialType.id,
        minHireMonths: null,
        maxHireMonths: null,
        receiveDays: 0,
        maxDays: 0,
        isBalance: true,
        label: `${pt.name} ${OFFICIAL_NAME}`,
      });
      if (rank.created) created.push(rank.row);
    }
  }
  log(`   → rank ที่ต้องสร้างใหม่: ${created.length}`);
  return created;
}

async function ensureRank(spec) {
  const where = {
    personnelTypeId: spec.personnelTypeId,
    leaveTypeId: spec.leaveTypeId,
    minHireMonths: spec.minHireMonths ?? null,
    maxHireMonths: spec.maxHireMonths ?? null,
  };
  if (!spec.leaveTypeId) return { created: false, row: null }; // dry-run: ยังไม่มี id ของ leaveType ใหม่
  const existing = await prisma.rank.findFirst({ where });
  if (existing) return { created: false, row: existing };
  log(`   🟢 rank: ${spec.label} (recv=${spec.receiveDays}, max=${spec.maxDays}, isBalance=${spec.isBalance})`);
  if (!apply) return { created: true, row: { ...where, ...spec } };
  const row = await prisma.rank.create({
    data: {
      rank: spec.label,
      personnelTypeId: spec.personnelTypeId,
      leaveTypeId: spec.leaveTypeId,
      minHireMonths: spec.minHireMonths ?? null,
      maxHireMonths: spec.maxHireMonths ?? null,
      receiveDays: spec.receiveDays ?? null,
      maxDays: spec.maxDays ?? null,
      isBalance: spec.isBalance ?? null,
    },
  });
  return { created: true, row };
}

// ── 4) ผูก userRank + สร้าง leaveBalance ปีงบปัจจุบันให้ผู้ใช้เดิม ──
async function backfillUsersForNewTypes(trainingType, officialType, fiscalYear) {
  log(`\n④ ผูกสิทธิ์ (userRank) + สร้างยอดวันลา (leaveBalance) ปีงบ ${fiscalYear} ให้ผู้ใช้ปัจจุบัน`);
  const newTypeIds = [trainingType?.id, officialType?.id].filter(Boolean);
  if (newTypeIds.length === 0) {
    log("   (dry-run: ยังไม่มี id ของประเภทใหม่ — ข้ามส่วนนี้ ให้รันด้วย --apply เพื่อดูผลจริง)");
    return;
  }

  // rank ทั้งหมดของประเภทใหม่ (per personnelType)
  const newRanks = await prisma.rank.findMany({
    where: { leaveTypeId: { in: newTypeIds } },
    include: { leaveType: { select: { id: true, name: true, isNonDeductible: true } } },
  });

  const users = await prisma.user.findMany({
    select: { id: true, personnelTypeId: true, sex: true, hireDate: true },
  });

  let linkedRanks = 0;
  let createdBalances = 0;

  const now = new Date();
  for (const user of users) {
    const hireMonths = user.hireDate
      ? (now.getFullYear() - user.hireDate.getFullYear()) * 12 +
        (now.getMonth() - user.hireDate.getMonth())
      : null;

    for (const rank of newRanks) {
      if (rank.personnelTypeId !== user.personnelTypeId) continue;

      // เงื่อนไขช่วงอายุงาน (ปัจจุบัน min/max = null ทั้งหมด → ผ่านทุกคน)
      const minPass = rank.minHireMonths === null || (hireMonths !== null && hireMonths >= rank.minHireMonths);
      const maxPass = rank.maxHireMonths === null || (hireMonths !== null && hireMonths <= rank.maxHireMonths);
      if (!minPass || !maxPass) continue;

      // นโยบายเพศ (training/official ไม่จำกัดเพศ แต่ตรวจไว้เพื่อความถูกต้อง)
      if (!isSexAllowedForLeaveType(user.sex, rank.leaveType?.name)) continue;

      // 4.1 userRank (idempotent ด้วย @@unique([userId, rankId]))
      const existingLink = await prisma.userRank.findFirst({
        where: { userId: user.id, rankId: rank.id },
      });
      if (!existingLink) {
        linkedRanks++;
        if (apply) {
          await prisma.userRank.create({ data: { userId: user.id, rankId: rank.id } });
        }
      }

      // 4.2 leaveBalance ปีงบปัจจุบัน (idempotent ด้วย user+leaveType+year)
      const existingBalance = await prisma.leaveBalance.findFirst({
        where: { userId: user.id, leaveTypeId: rank.leaveTypeId, year: fiscalYear },
      });
      if (!existingBalance) {
        const nonDeductible = rank.leaveType?.isNonDeductible === true;
        const data = nonDeductible
          ? { userId: user.id, leaveTypeId: rank.leaveTypeId, maxDays: 0, usedDays: 0, pendingDays: 0, remainingDays: 0, year: fiscalYear }
          : {
              userId: user.id,
              leaveTypeId: rank.leaveTypeId,
              maxDays: rank.maxDays ?? 0,
              usedDays: 0,
              pendingDays: 0,
              remainingDays: rank.receiveDays ?? rank.maxDays ?? 0,
              year: fiscalYear,
            };
        createdBalances++;
        if (apply) await prisma.leaveBalance.create({ data });
      }
    }
  }

  log(`   → ผู้ใช้ทั้งหมด ${users.length} คน`);
  log(`   → userRank ที่${apply ? "" : "จะ"}สร้าง: ${linkedRanks}`);
  log(`   → leaveBalance ที่${apply ? "" : "จะ"}สร้าง: ${createdBalances}`);
}

async function main() {
  apply = process.argv.includes("--apply");
  log("═══════════════════════════════════════════");
  log(`  Migration ประเภทการลา — โหมด: ${apply ? "APPLY (เขียนจริง)" : "DRY-RUN (ตรวจอย่างเดียว)"}`);
  log("═══════════════════════════════════════════");

  const fiscalYear = await resolveFiscalYear();
  log(`ปีงบประมาณปัจจุบัน (ค.ศ.): ${fiscalYear}`);

  const studyType = await renameStudyType();
  const created = await ensureLeaveTypes();
  const trainingType = created[TRAINING_NAME];
  const officialType = created[OFFICIAL_NAME];

  await ensureRanks(studyType, trainingType, officialType);
  await backfillUsersForNewTypes(trainingType, officialType, fiscalYear);

  log("\n───────────────────────────────────────────");
  if (!apply) {
    log("DRY-RUN เสร็จ — ยังไม่มีการเขียนข้อมูล");
    log("➜ เพิ่ม --apply เพื่อเขียนจริง (แนะนำ backup ก่อน: npm run db:backup)");
  } else {
    log("✅ Migration เสร็จสมบูรณ์");
  }
  log("═══════════════════════════════════════════");
}

main()
  .catch((e) => {
    console.error("❌ ผิดพลาด:", e.message);
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
