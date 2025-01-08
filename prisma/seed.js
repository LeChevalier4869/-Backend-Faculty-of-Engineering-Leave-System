import { PrismaClient } from '@prisma/client';
const prisma = require('../src/config/prisma');

async function level() {

    const Individual = await prisma.levels.upsert({
        where: { id: 1 },
        create: { level: 'Individual' },
    });
    const Advisor = await prisma.levels.upsert({
        where: { id: 2 },
        create: { level: 'Advisor' },
    });
    const Faculty = await prisma.levels.upsert({
        where: { id: 3 },
        create: { level: 'Faculty' },
    });
    const University = await prisma.levels.upsert({
        where: { id: 4 },
        create: { level: 'University' },
    });

    console.log({ Individual, Advisor, Faculty, University });
}

async function personnelType() {
    const Permanent = await prisma.personnelTypes.upsert({
        where: { id: 1 },
        create: { name: 'Permanent' },
    });
    const Government = await prisma.personnelTypes.upsert({
        where: { id: 2 },
        create: { name: 'Government' },
    });
    const EmployeesInHigherEdu = await prisma.personnelTypes.upsert({
        where: { id: 3 },
        create: { name: 'Employee_in_Higher_Education_Institutions' },
    });
    const RevenueBased = await prisma.personnelTypes.upsert({
        where: { id: 4 },
        create: {
            name: 'Revenue_Based'
        },
    });

    console.log({ Permanent, Government, EmployeesInHigherEdu, RevenueBased });
}

async function department() {
    const Civil = await prisma.departments.upsert({
        where: { id: 1 },
        create: { name: 'Civil_Engineering' },
    });
    const Electrical = await prisma.departments.upsert({
        where: { id: 2 },
        create: { name: 'Electrical_Engineering' },
    });
    const Electronics = await prisma.departments.upsert({
        where: {id: 3},
        create: { name: 'Electronics_Engineering' },
    });
    const Computer = await prisma.departments.upsert({
        where: {id: 4},
        create: { name: 'Computer_Engineering' },
    });
    const Mechatronics = await prisma.departments.upsert({
        where: {id: 5},
        create: {name: 'Mechatronics_Engineering'},
    });
    const Mechanical = await prisma.departments.upsert({
        where: {id: 6},
        create: {name: 'Mechanical_Engineering'},
    });
    const AgriculturalMachinery = await prisma.departments.upsert({
        where: {id: 7},
        create: {name: 'Agricultural_Machinery_Engineering'},
    });
    const FoodAndBioprocess = await prisma.departments.upsert({
        where: {id: 8},
        create: {name: 'Food_and_Bioprocess_Engineering'},
    });
    const Industrial = await prisma.departments.upsert({
        where: {id: 9},
        create: {name: 'Industrial_Engineering'},
    });
    const Metallurgical = await prisma.departments.upsert({
        where: {id: 10},
        create: {name: 'Metallurgical_Engineering'},
    });
    const Chemistry = await prisma.departments.upsert({
        where: {id: 11},
        create: {name: 'Chemistry'},
    });
    const Mathematics = await prisma.departments.upsert({
        where: {id: 12},
        create: {name: 'Mathematics'},
    });
    const AppliedPhysics = await prisma.departments.upsert({
        where: {id: 13},
        create: {name: 'Applied_Physics'},
    });
    const AppliedStatistics = await prisma.departments.upsert({
        where: {id: 14},
        create: {name: 'Applied_Statistics'},
    });

    console.log({ Civil, Electrical, Electronics, Computer, Mechatronics, Mechanical, AgriculturalMachinery, FoodAndBioprocess, Industrial, Metallurgical, Chemistry, Mathematics, AppliedPhysics, AppliedStatistics });
}

async function main() {
    level();
    personnelType();
    department();
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