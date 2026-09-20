PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS "AuditLog";
DROP TABLE IF EXISTS "RepairRecord";
DROP TABLE IF EXISTS "BorrowApproval";
DROP TABLE IF EXISTS "BorrowRequest";
DROP TABLE IF EXISTS "Device";
DROP TABLE IF EXISTS "User";
DROP TABLE IF EXISTS "Department";

PRAGMA foreign_keys = ON;

CREATE TABLE "Department" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "managerId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "username" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "departmentId" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Device" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL UNIQUE,
  "type" TEXT NOT NULL,
  "brand" TEXT,
  "model" TEXT,
  "location" TEXT NOT NULL,
  "ownerId" TEXT,
  "purchaseDate" DATETIME,
  "warrantyExpireDate" DATETIME,
  "value" REAL,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "description" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Device_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "BorrowRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "deviceId" TEXT NOT NULL,
  "applicantId" TEXT NOT NULL,
  "departmentId" TEXT,
  "borrowStartAt" DATETIME NOT NULL,
  "borrowEndAt" DATETIME NOT NULL,
  "purpose" TEXT NOT NULL,
  "remark" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
  "pickedUpAt" DATETIME,
  "returnedAt" DATETIME,
  "returnCondition" TEXT,
  "returnRemark" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BorrowRequest_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BorrowRequest_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BorrowRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "BorrowApproval" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "borrowRequestId" TEXT NOT NULL,
  "approverId" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "comment" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BorrowApproval_borrowRequestId_fkey" FOREIGN KEY ("borrowRequestId") REFERENCES "BorrowRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BorrowApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "RepairRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "deviceId" TEXT NOT NULL,
  "borrowRequestId" TEXT,
  "faultDescription" TEXT NOT NULL,
  "repairerId" TEXT,
  "repairStartAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "repairEndAt" DATETIME,
  "cost" REAL,
  "status" TEXT NOT NULL DEFAULT 'WAITING_ACCEPT',
  "result" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RepairRecord_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RepairRecord_borrowRequestId_fkey" FOREIGN KEY ("borrowRequestId") REFERENCES "BorrowRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RepairRecord_repairerId_fkey" FOREIGN KEY ("repairerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "detail" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "BorrowRequest_deviceId_idx" ON "BorrowRequest" ("deviceId");
CREATE INDEX "BorrowRequest_status_idx" ON "BorrowRequest" ("status");
CREATE INDEX "RepairRecord_deviceId_idx" ON "RepairRecord" ("deviceId");
CREATE INDEX "RepairRecord_status_idx" ON "RepairRecord" ("status");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog" ("createdAt");
