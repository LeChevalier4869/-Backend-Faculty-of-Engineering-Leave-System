const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function role() {
    const User = await prisma.roles.upsert({
        where: { id: 1 },
        update: {},
        create: {
            name: "USER",
            description: "ผู้ใช้งานทั่วไป"
        },
    });
    const Admin = await prisma.roles.upsert({
        where: { id: 2 },
        update: {},
        create: {
            name: "ADMIN",
            description: "ผู้ที่สามารถทำได้ทุกอย่าง"
        },
    });
    const Approver1 = await prisma.roles.upsert({
        where: { id: 3 },
        update: {},
        create: {
            name: "APPROVER_1",
            description: "ผู้ทีมีอำนาจในการอนุมัติลำดับที่ 1"
        },
    });
    const Approver2 = await prisma.roles.upsert({
        where: { id: 4 },
        update: {},
        create: {
            name: "APPROVER_2",
            description: "ผู้ทีมีอำนาจในการอนุมัติลำดับที่ 2"
        },
    });
    const Approver3 = await prisma.roles.upsert({
        where: { id: 5 },
        update: {},
        create: {
            name: "APPROVER_3",
            description: "ผู้ทีมีอำนาจในการอนุมัติลำดับที่ 3"
        },
    });
    const Approver4 = await prisma.roles.upsert({
        where: { id: 6 },
        update: {},
        create: {
            name: "APPROVER_4",
            description: "ผู้ทีมีอำนาจในการอนุมัติลำดับที่ 4"
        },
    });
    const Verifier = await prisma.roles.upsert({
        where: { id: 7 },
        update: {},
        create: {
            name: "VERIFIER",
            description: "ผู้ตรวจสอบ"
        },
    });
    const Receiver = await prisma.roles.upsert({
        where: { id: 8 },
        update: {},
        create: {
            name: "RECEIVER",
            description: "ผู้รับหนังสือ"
        },
    });
}

async function personnelType() {
    const CivilServants = await prisma.personneltypes.upsert({
        where: { id: 1 },
        update: {},
        create: { name: "ข้าราชการพลเรือนในสถาบันอุดมศึกษา" }  
    });
    const Permanent = await prisma.personneltypes.upsert({
        where: { id: 2 },
        update: {},
        create: { name: 'ลูกจ้างประจำ' },
    });
    const Government = await prisma.personneltypes.upsert({
        where: { id: 3 },
        update: {},
        create: { name: 'พนักงานราชการ' },
    });
    const EmployeesInHigherEdu = await prisma.personneltypes.upsert({
        where: { id: 4 },
        update: {},
        create: { name: 'พนักงานในสถาบันอุดมศึกษา' },
    });
    const RevenueBased = await prisma.personneltypes.upsert({
        where: { id: 5 },
        update: {},
        create: { name: 'ลูกจ้างเงินรายได้' },
    });

    console.log({ CivilServants, Permanent, Government, EmployeesInHigherEdu, RevenueBased });
}

async function organization() {
    const Engineering = await prisma.organizations.upsert({
        where: { id: 1 },
        update: {},
        create: { name: 'คณะวิศวกรรมศาสตร์' },
    });
    const IndustrialEducation = await prisma.organizations.upsert({
        where: { id: 2 },
        update: {},
        create: { name: 'คณะครุศาสตร์อุตสาหกรรม' },
    });
    const BusinessAdministration = await prisma.organizations.upsert({
        where: { id: 3 },
        update: {},
        create: { name: 'คณะบริหารธุรกิจและเทคโนโลยีสารสนเทศ' },
    });

    console.log({ Engineering, IndustrialEducation, BusinessAdministration });
}

async function department() {
    const Civil = await prisma.departments.upsert({
        where: { id: 1 },
        update: {},
        create: { name: 'สาขาวิชาวิศวกรรมโยธา', organizationId: 1, isHeadId: null},
    });
    const Electrical = await prisma.departments.upsert({
        where: { id: 2 },
        update: {},
        create: { name: 'สาขาวิชาวิศวกรรมไฟฟ้า', organizationId: 1, isHeadId: null},
    });
    const Electronics = await prisma.departments.upsert({
        where: {id: 3},
        update: {},
        create: { name: 'สาขาวิชาวิศวกรรมอิเล็กทรอนิกส์ฯ', organizationId: 1, isHeadId: null},
    });
    const Computer = await prisma.departments.upsert({
        where: {id: 4},
        update: {},
        create: { name: 'สาขาวิชาวิศวกรรมคอมพิวเตอร์', organizationId: 1, isHeadId: null},
    });
    const Mechatronics = await prisma.departments.upsert({
        where: {id: 5},
        update: {},
        create: {name: 'สาขาวิชาวิศวกรรมเมคคาทรอนิกส์', organizationId: 1, isHeadId: null},
    });
    const Mechanical = await prisma.departments.upsert({
        where: {id: 6},
        update: {},
        create: {name: 'สาขาวิชาวิศวกรรมเครื่องกล', organizationId: 1, isHeadId: null},
    });
    const AgriculturalMachinery = await prisma.departments.upsert({
        where: {id: 7},
        update: {},
        create: {name: 'สาขาวิชาวิศวกรรมเครื่องจักรกลเกษตร', organizationId: 1, isHeadId: null},
    });
    const FoodAndBioprocess = await prisma.departments.upsert({
        where: {id: 8},
        update: {},
        create: {name: 'สาขาวิชาวิศวกรรมอาหารและชีวภาพ', organizationId: 1, isHeadId: null}, 
    });
    const Industrial = await prisma.departments.upsert({
        where: {id: 9},
        update: {},
        create: {name: 'สาขาวิชาวิศวกรรมอุตสาหการ', organizationId: 1, isHeadId: null},
    });
    const Metallurgical = await prisma.departments.upsert({
        where: {id: 10},
        update: {},
        create: {name: 'สาขาวิชาวิศวกรรมโลหการ', organizationId: 1, isHeadId: null},
    });
    const Chemistry = await prisma.departments.upsert({
        where: {id: 11},
        update: {},
        create: {name: 'สาขาวิชาสาขาวิชาเคมี', organizationId: 1, isHeadId: null},
    });
    const Mathematics = await prisma.departments.upsert({
        where: {id: 12},
        update: {},
        create: {name: 'สาขาวิชาคณิตศาสตร์', organizationId: 1, isHeadId: null},
    });
    const AppliedPhysics = await prisma.departments.upsert({
        where: {id: 13},
        update: {},
        create: {name: 'สาขาวิชาฟิสิกส์ประยุกต์', organizationId: 1, isHeadId: null},
    });
    const AppliedStatistics = await prisma.departments.upsert({
        where: {id: 14},
        update: {},
        create: {name: 'สาขาวิชาสถิติประยุกต์', organizationId: 1, isHeadId: null},
    });

    console.log({ Civil, Electrical, Electronics, Computer, Mechatronics, Mechanical, AgriculturalMachinery, FoodAndBioprocess, Industrial, Metallurgical, Chemistry, Mathematics, AppliedPhysics, AppliedStatistics });
}

async function leaveType() {
    // not complete
    // const SickLeave = await prisma.leavetypes.upsert({
    //     where: { id: 1 },
    //     update: {},
    //     create: { 
    //         data: {
    //             name: 'ลาป่วย',
    //             maxDays: 30,
    //             conditions: JSON.stringify({
    //                 requireDocument: { minDays: 2, documentType: 'ใบรับรองแพทย์' },
    //                 advanceNoticeDays: { required: false, ifKnown: 3 },
    //                 maxDaysPerRequest: 7,
    //                 maxDaysPerYear: 30,
    //                 allowEmergency: true,
    //                 emergencyPolicy: { notifyLater: true, gracePeriodDays: 3 }
    //             })
    //         }
    //      }
    // });
    // ลูกจ้างประจำ 
    // const PersonalLeave = await prisma.leavetypes.upsert({
    //     where: { id: 2 },
    //     update: {},
    //     create: {
    //         data: {
    //             name: 'ลากิจส่วนตัว',
    //             maxDays: 45,
    //             conditions: JSON.stringify({
    //                 requireDocument: {
    //                     mandatory: true,
    //                     forReasons: ["เลี้ยงดูบุตร", "งานส่วนตัว", "ธุระสำคัญ"],
    //                     documentTypes: ["ใบลา", "เอกสารชี้แจง"]
    //                 },
    //                 advanceNoticeDays: { required: true, days: 3 },
    //                 maxDaysPerRequest: 5,
    //                 maxDaysPerYear: 45,
    //                 allowEmergency: true,
    //                 emergencyPolicy: { notifyLater: true, gracePeriodDays: 1 }, 
    //                 limitedReasons: ["เลี้ยงดูบุตร", "ธุระส่วนตัว"],
    //                 disallowedReasons: ["ท่องเที่ยว", "เหตุผลส่วนตัวที่ไม่จำเป็น"],
    //                 specialConditions: {
    //                     firstYear: {
    //                         maxDaysPerYear: 15,
    //                         allowedWithoutPay: true,
    //                     },
    //                     afterFirstYear: {
    //                         additionalDays: 30,
    //                         allowedWithPay: true,
    //                     },
    //                     maternityToChildcare: {
    //                         maxDays: 150,
    //                         allowedWithoutPay: true,
    //                     }
    //                 }
    //             })
    //         }
    //     }
    // });

    const leaveTypes = [
        { name: "ลาป่วย", conditions: {} },
        { name: "ลากิจส่วนตัว", conditions: {} },
        { name: "ลาพักผ่อน", conditions: {} },
    ];

    for (const leave of leaveTypes) {
        await prisma.leavetypes.upsert({
            where: { name: leave.name },
            update: {},
            create: leave,
        });
    }

    console.log("Seed data inserted successfully!");
}

async function main() {
    await role();
    await personnelType();
    await organization();
    await department();
    await leaveType();
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect()
        process.exit(1);
    });