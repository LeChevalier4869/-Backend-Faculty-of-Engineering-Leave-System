const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function level() {

    const Individual = await prisma.levels.upsert({
        where: { id: 1 },
        update: {},
        create: { level: 'ระดับบุคคล' },
    });
    const Advisor = await prisma.levels.upsert({
        where: { id: 2 },
        update: {},
        create: { level: 'หัวหน้าภาควิชา' },
    });
    const Faculty = await prisma.levels.upsert({
        where: { id: 3 },
        update: {},
        create: { level: 'ระดับคณะ' },
    });
    const University = await prisma.levels.upsert({
        where: { id: 4 },
        update: {},
        create: { level: 'ระดับมหาวิทยาลัย' },
    });

    console.log({ Individual, Advisor, Faculty, University });
}

async function personnelType() {
    const Permanent = await prisma.personnelTypes.upsert({
        where: { id: 1 },
        update: {},
        create: { name: 'ลูกจ้างประจำ' },
    });
    const Government = await prisma.personnelTypes.upsert({
        where: { id: 2 },
        update: {},
        create: { name: 'พนักงานราชการ' },
    });
    const EmployeesInHigherEdu = await prisma.personnelTypes.upsert({
        where: { id: 3 },
        update: {},
        create: { name: 'พนักงานในสถาบันอุดมศึกษา' },
    });
    const RevenueBased = await prisma.personnelTypes.upsert({
        where: { id: 4 },
        update: {},
        create: { name: 'ลูกจ้างเงินรายได้' },
    });

    console.log({ Permanent, Government, EmployeesInHigherEdu, RevenueBased });
}

async function department() {
    const Civil = await prisma.departments.upsert({
        where: { id: 1 },
        update: {},
        create: { name: 'สาขาวิชาวิศวกรรมโยธา' },
    });
    const Electrical = await prisma.departments.upsert({
        where: { id: 2 },
        update: {},
        create: { name: 'สาขาวิชาวิศวกรรมไฟฟ้า' },
    });
    const Electronics = await prisma.departments.upsert({
        where: {id: 3},
        update: {},
        create: { name: 'สาขาวิชาวิศวกรรมอิเล็กทรอนิกส์ฯ' },
    });
    const Computer = await prisma.departments.upsert({
        where: {id: 4},
        update: {},
        create: { name: 'สาขาวิชาวิศวกรรมคอมพิวเตอร์' },
    });
    const Mechatronics = await prisma.departments.upsert({
        where: {id: 5},
        update: {},
        create: {name: 'สาขาวิชาวิศวกรรมเมคคาทรอนิกส์'},
    });
    const Mechanical = await prisma.departments.upsert({
        where: {id: 6},
        update: {},
        create: {name: 'สาขาวิชาวิศวกรรมเครื่องกล'},
    });
    const AgriculturalMachinery = await prisma.departments.upsert({
        where: {id: 7},
        update: {},
        create: {name: 'สาขาวิชาวิศวกรรมเครื่องจักรกลเกษตร'},
    });
    const FoodAndBioprocess = await prisma.departments.upsert({
        where: {id: 8},
        update: {},
        create: {name: 'สาขาวิชาวิศวกรรมอาหารและชีวภาพ'},
    });
    const Industrial = await prisma.departments.upsert({
        where: {id: 9},
        update: {},
        create: {name: 'สาขาวิชาวิศวกรรมอุตสาหการ'},
    });
    const Metallurgical = await prisma.departments.upsert({
        where: {id: 10},
        update: {},
        create: {name: 'สาขาวิชาวิศวกรรมโลหการ'},
    });
    const Chemistry = await prisma.departments.upsert({
        where: {id: 11},
        update: {},
        create: {name: 'สาขาวิชาสาขาวิชาเคมี'},
    });
    const Mathematics = await prisma.departments.upsert({
        where: {id: 12},
        update: {},
        create: {name: 'สาขาวิชาคณิตศาสตร์'},
    });
    const AppliedPhysics = await prisma.departments.upsert({
        where: {id: 13},
        update: {},
        create: {name: 'สาขาวิชาฟิสิกส์ประยุกต์'},
    });
    const AppliedStatistics = await prisma.departments.upsert({
        where: {id: 14},
        update: {},
        create: {name: 'สาขาวิชาสถิติประยุกต์'},
    });

    console.log({ Civil, Electrical, Electronics, Computer, Mechatronics, Mechanical, AgriculturalMachinery, FoodAndBioprocess, Industrial, Metallurgical, Chemistry, Mathematics, AppliedPhysics, AppliedStatistics });
}


async function main() {
    await level();
    await personnelType();
    await department();
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