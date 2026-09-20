import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const APPROVAL_REQUIRED_KEY = 'approvalRequired';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getApprovalRequired() {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: APPROVAL_REQUIRED_KEY } });
    return setting?.value !== 'false';
  }

  async getSettings() {
    return {
      approvalRequired: await this.getApprovalRequired(),
    };
  }

  async updateApprovalRequired(approvalRequired: boolean) {
    await this.prisma.systemSetting.upsert({
      where: { key: APPROVAL_REQUIRED_KEY },
      create: { key: APPROVAL_REQUIRED_KEY, value: String(approvalRequired) },
      update: { value: String(approvalRequired) },
    });
    return this.getSettings();
  }
}
