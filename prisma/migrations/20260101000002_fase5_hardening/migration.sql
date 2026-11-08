-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totpSecret" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "verifactuRecord" JSONB,
ADD COLUMN     "verifactuSentAt" TIMESTAMP(3);

