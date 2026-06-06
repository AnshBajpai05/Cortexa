import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
  console.log("Seeding database...");
  
  const workspace = await prisma.workspace.upsert({
    where: { id: 'default-workspace' },
    update: {},
    create: {
      id: 'default-workspace',
      name: 'Default Workspace',
    },
  });
  
  console.log("Workspace created/verified:", workspace.id);
  
  const user = await prisma.user.upsert({
    where: { email: 'admin@cortexa.ai' },
    update: {},
    create: {
      email: 'admin@cortexa.ai',
      role: 'admin',
    },
  });
  
  console.log("User created/verified:", user.email);
  
  await prisma.workspaceMember.upsert({
    where: {
      userId_workspaceId: {
        userId: user.id,
        workspaceId: workspace.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      workspaceId: workspace.id,
    },
  });
  
  console.log("User added to workspace.");
}

seed()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
