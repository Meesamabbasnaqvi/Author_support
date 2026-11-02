/*
  Warnings:

  - You are about to drop the column `fileName` on the `Attachment` table. All the data in the column will be lost.
  - You are about to drop the column `fileSize` on the `Attachment` table. All the data in the column will be lost.
  - You are about to drop the column `fileType` on the `Attachment` table. All the data in the column will be lost.
  - You are about to drop the column `fileUrl` on the `Attachment` table. All the data in the column will be lost.
  - Added the required column `filename` to the `Attachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mimeType` to the `Attachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `size` to the `Attachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `url` to the `Attachment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Attachment" DROP COLUMN "fileName",
DROP COLUMN "fileSize",
DROP COLUMN "fileType",
DROP COLUMN "fileUrl",
ADD COLUMN     "filename" TEXT NOT NULL,
ADD COLUMN     "mimeType" TEXT NOT NULL,
ADD COLUMN     "size" INTEGER NOT NULL,
ADD COLUMN     "url" TEXT NOT NULL,
ALTER COLUMN "ticketId" DROP NOT NULL;
