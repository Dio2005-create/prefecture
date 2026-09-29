BEGIN;

UPDATE "User"
SET "role" = 'ADMIN'::"RoleUtilisateur"
WHERE "role"::text = 'SUPERADMIN';

DO $$
DECLARE
  admin_role_id TEXT;
  superadmin_role_id TEXT;
BEGIN
  SELECT "id" INTO admin_role_id FROM "Role" WHERE "name"::text = 'ADMIN';
  SELECT "id" INTO superadmin_role_id FROM "Role" WHERE "name"::text = 'SUPERADMIN';

  IF superadmin_role_id IS NOT NULL AND admin_role_id IS NOT NULL THEN
    DELETE FROM "UserRole" super_link
    USING "UserRole" admin_link
    WHERE super_link."roleId" = superadmin_role_id
      AND admin_link."roleId" = admin_role_id
      AND admin_link."userId" = super_link."userId";

    UPDATE "UserRole" SET "roleId" = admin_role_id WHERE "roleId" = superadmin_role_id;
    DELETE FROM "Role" WHERE "id" = superadmin_role_id;
  ELSIF superadmin_role_id IS NOT NULL THEN
    UPDATE "Role" SET "name" = 'ADMIN'::"RoleName" WHERE "id" = superadmin_role_id;
  END IF;
END $$;

ALTER TABLE "Role" ALTER COLUMN "name" TYPE TEXT USING "name"::TEXT;
DROP TYPE "RoleName";
CREATE TYPE "RoleName" AS ENUM ('CITIZEN', 'ADMIN');
ALTER TABLE "Role" ALTER COLUMN "name" TYPE "RoleName" USING "name"::"RoleName";

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE TEXT USING "role"::TEXT;
DROP TYPE "RoleUtilisateur";
CREATE TYPE "RoleUtilisateur" AS ENUM ('CITIZEN', 'ADMIN');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "RoleUtilisateur" USING "role"::"RoleUtilisateur";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'CITIZEN'::"RoleUtilisateur";

COMMIT;
