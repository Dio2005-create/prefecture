INSERT INTO "Role" ("id", "name", "description", "createdAt", "updatedAt")
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'SUPERADMIN',
  'Super-administrateur',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "UserRole" ("id", "userId", "roleId")
SELECT
  gen_random_uuid()::text,
  u."id",
  r."id"
FROM "User" u
CROSS JOIN "Role" r
WHERE LOWER(u."email") = 'superadmin@prefecture.mg'
  AND r."name" = 'SUPERADMIN'
ON CONFLICT ("userId", "roleId") DO NOTHING;
