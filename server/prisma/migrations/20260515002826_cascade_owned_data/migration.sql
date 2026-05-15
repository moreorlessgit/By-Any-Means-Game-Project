-- DropForeignKey
ALTER TABLE "PrivateWorld" DROP CONSTRAINT "PrivateWorld_owner_user_id_fkey";

-- DropForeignKey
ALTER TABLE "PrivateWorldSave" DROP CONSTRAINT "PrivateWorldSave_world_id_fkey";

-- DropForeignKey
ALTER TABLE "Settings" DROP CONSTRAINT "Settings_user_id_fkey";

-- AddForeignKey
ALTER TABLE "PrivateWorld" ADD CONSTRAINT "PrivateWorld_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateWorldSave" ADD CONSTRAINT "PrivateWorldSave_world_id_fkey" FOREIGN KEY ("world_id") REFERENCES "PrivateWorld"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
