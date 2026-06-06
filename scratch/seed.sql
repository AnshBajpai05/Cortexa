INSERT INTO "Workspace" (id, name, "createdAt") VALUES ('default-workspace', 'Default Workspace', NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO "User" (id, email, role, "createdAt") VALUES ('admin-user', 'admin@cortexa.ai', 'admin', NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO "WorkspaceMember" ("userId", "workspaceId", "joinedAt") VALUES ('admin-user', 'default-workspace', NOW()) ON CONFLICT ("userId", "workspaceId") DO NOTHING;
