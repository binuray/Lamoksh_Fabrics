import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PERMISSIONS = [
  'PRODUCT_CREATE',
  'PRODUCT_READ',
  'PRODUCT_UPDATE',
  'PRODUCT_DELETE',
  'ORDER_READ',
  'ORDER_UPDATE',
  'USER_READ',
  'USER_UPDATE',
  'USER_DELETE',
  'CATEGORY_CREATE',
  'CATEGORY_READ',
  'CATEGORY_UPDATE',
  'CATEGORY_DELETE',
  'COUPON_CREATE',
  'COUPON_UPDATE',
  'COUPON_DELETE',
  'REPORT_READ',
  'ADMIN_CREATE',
  'ADMIN_READ',
  'ADMIN_UPDATE',
  'ADMIN_DELETE',
  'SETTINGS_READ',
  'SETTINGS_UPDATE',
];

const ROLES = [
  { name: 'SUPER_ADMIN', description: 'Highest authority in the system with full permissions' },
  { name: 'ADMIN', description: 'System administrator with configurable permissions' },
  { name: 'USER', description: 'Standard customer user' },
];

async function main() {
  console.log('Seeding roles...');
  for (const roleData of ROLES) {
    await prisma.role.upsert({
      where: { name: roleData.name },
      update: { description: roleData.description },
      create: roleData,
    });
  }

  console.log('Seeding permissions...');
  for (const permName of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: permName },
      update: { description: `Permission to perform ${permName}` },
      create: {
        name: permName,
        description: `Permission to perform ${permName}`,
      },
    });
  }

  // Grant all permissions to SUPER_ADMIN role
  const superAdminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
  const allPermissions = await prisma.permission.findMany();

  if (superAdminRole && allPermissions.length > 0) {
    console.log('Assigning all permissions to SUPER_ADMIN...');
    for (const perm of allPermissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: superAdminRole.id,
            permissionId: perm.id,
          },
        },
        update: {},
        create: {
          roleId: superAdminRole.id,
          permissionId: perm.id,
        },
      });
    }
  }

  console.log('Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Error during database seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
