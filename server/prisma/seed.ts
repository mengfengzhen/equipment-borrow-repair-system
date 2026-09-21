import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.repairRecord.deleteMany();
  await prisma.borrowApproval.deleteMany();
  await prisma.borrowItem.deleteMany();
  await prisma.borrowRequest.deleteMany();
  await prisma.device.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();

  const product = await prisma.department.create({ data: { name: '产品研发部' } });
  const adminDept = await prisma.department.create({ data: { name: '行政资产部' } });

  const passwordHash = await bcrypt.hash('admin123', 10);
  const commonHash = await bcrypt.hash('user123', 10);
  const repairHash = await bcrypt.hash('repair123', 10);

  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      passwordHash,
      name: '张辰',
      role: 'ADMIN',
      departmentId: adminDept.id,
      phone: '13800000001',
      email: 'admin@example.com',
    },
  });

  const manager = await prisma.user.create({
    data: {
      username: 'manager',
      passwordHash: await bcrypt.hash('manager123', 10),
      name: '林知夏',
      role: 'MANAGER',
      departmentId: product.id,
      phone: '13800000002',
      email: 'manager@example.com',
    },
  });

  const user = await prisma.user.create({
    data: {
      username: 'user',
      passwordHash: commonHash,
      name: '许一诺',
      role: 'USER',
      departmentId: product.id,
      phone: '13800000003',
      email: 'user@example.com',
    },
  });

  const user2 = await prisma.user.create({
    data: {
      username: 'user2',
      passwordHash: commonHash,
      name: '周屿',
      role: 'USER',
      departmentId: product.id,
      phone: '13800000005',
      email: 'user2@example.com',
    },
  });

  const repairer = await prisma.user.create({
    data: {
      username: 'repair',
      passwordHash: repairHash,
      name: '沈明远',
      role: 'REPAIRER',
      departmentId: adminDept.id,
      phone: '13800000004',
      email: 'repair@example.com',
    },
  });

  const repairer2 = await prisma.user.create({
    data: {
      username: 'repair2',
      passwordHash: repairHash,
      name: '梁嘉禾',
      role: 'REPAIRER',
      departmentId: adminDept.id,
      phone: '13800000006',
      email: 'repair2@example.com',
    },
  });

  await prisma.department.update({
    where: { id: product.id },
    data: { managerId: manager.id },
  });

  await prisma.device.createMany({
    data: [
      {
        name: '索尼 A7M4 相机',
        code: 'CAM-2026-001',
        type: '摄影器材',
        brand: 'Sony',
        model: 'A7M4',
        location: '行政库房 A1',
        ownerId: admin.id,
        purchaseDate: new Date('2025-03-01'),
        warrantyExpireDate: new Date('2028-03-01'),
        value: 16800,
        status: 'AVAILABLE',
        description: '用于活动拍摄和产品宣传素材采集。',
      },
      {
        name: 'MacBook Pro 14',
        code: 'LAP-2026-002',
        type: '电脑设备',
        brand: 'Apple',
        model: 'M3 Pro',
        location: '行政库房 B2',
        ownerId: admin.id,
        purchaseDate: new Date('2025-10-10'),
        warrantyExpireDate: new Date('2028-10-10'),
        value: 18999,
        status: 'BORROWED',
        description: '临时开发环境设备。',
      },
      {
        name: '网络测试仪',
        code: 'NET-2026-003',
        type: '测试设备',
        brand: 'Fluke',
        model: 'LinkIQ',
        location: '实验室 C3',
        ownerId: admin.id,
        purchaseDate: new Date('2024-06-15'),
        warrantyExpireDate: new Date('2027-06-15'),
        value: 7200,
        status: 'REPAIRING',
        description: '网络链路质量检测设备。',
      },
      {
        name: '会议全向麦',
        code: 'AUD-2026-004',
        type: '音频设备',
        brand: 'Jabra',
        model: 'Speak2 75',
        location: '行政库房 A2',
        ownerId: admin.id,
        purchaseDate: new Date('2025-07-20'),
        warrantyExpireDate: new Date('2027-07-20'),
        value: 2680,
        status: 'AVAILABLE',
        description: '会议室和外部宣讲临时借用。',
      },
      {
        name: '投影仪',
        code: 'PRJ-2026-005',
        type: '会议设备',
        brand: 'Epson',
        model: 'CB-FH52',
        location: '行政库房 A3',
        ownerId: admin.id,
        purchaseDate: new Date('2024-11-11'),
        warrantyExpireDate: new Date('2027-11-11'),
        value: 5600,
        status: 'AVAILABLE',
        description: '培训和路演投影使用。',
      },
      {
        name: '便携显示器',
        code: 'MON-2026-006',
        type: '电脑设备',
        brand: 'Lenovo',
        model: 'ThinkVision M14',
        location: '行政库房 B1',
        ownerId: admin.id,
        purchaseDate: new Date('2025-01-12'),
        warrantyExpireDate: new Date('2028-01-12'),
        value: 1799,
        status: 'AVAILABLE',
        description: '外出办公扩展屏。',
      },
      {
        name: '手持云台',
        code: 'CAM-2026-007',
        type: '摄影器材',
        brand: 'DJI',
        model: 'RS 4',
        location: '行政库房 A1',
        ownerId: admin.id,
        purchaseDate: new Date('2025-05-19'),
        warrantyExpireDate: new Date('2027-05-19'),
        value: 3299,
        status: 'AVAILABLE',
        description: '视频拍摄稳定器。',
      },
      {
        name: '录音笔',
        code: 'AUD-2026-008',
        type: '音频设备',
        brand: 'Sony',
        model: 'ICD-UX570F',
        location: '行政库房 A2',
        ownerId: admin.id,
        purchaseDate: new Date('2024-08-08'),
        warrantyExpireDate: new Date('2026-08-08'),
        value: 899,
        status: 'AVAILABLE',
        description: '访谈和会议纪要录音。',
      },
      {
        name: '标签打印机',
        code: 'OFF-2026-009',
        type: '办公设备',
        brand: 'Brother',
        model: 'PT-P900',
        location: '行政库房 D1',
        ownerId: admin.id,
        purchaseDate: new Date('2023-12-01'),
        warrantyExpireDate: new Date('2026-12-01'),
        value: 1380,
        status: 'AVAILABLE',
        description: '资产标签和线缆标签打印。',
      },
      {
        name: '备用路由器',
        code: 'NET-2026-010',
        type: '网络设备',
        brand: 'H3C',
        model: 'Magic BE18000',
        location: '实验室 C1',
        ownerId: admin.id,
        purchaseDate: new Date('2025-09-03'),
        warrantyExpireDate: new Date('2028-09-03'),
        value: 1299,
        status: 'AVAILABLE',
        description: '临时网络环境搭建。',
      },
      {
        name: '移动硬盘 4T',
        code: 'STO-2026-011',
        type: '存储设备',
        brand: 'SanDisk',
        model: 'Extreme Pro',
        location: '行政库房 B3',
        ownerId: admin.id,
        purchaseDate: new Date('2025-04-17'),
        warrantyExpireDate: new Date('2028-04-17'),
        value: 1499,
        status: 'DISABLED',
        description: '盘体老化，等待管理员处理。',
      },
      {
        name: '备用手机',
        code: 'MOB-2026-012',
        type: '移动设备',
        brand: 'Xiaomi',
        model: '14 Pro',
        location: '行政库房 B4',
        ownerId: admin.id,
        purchaseDate: new Date('2024-03-22'),
        warrantyExpireDate: new Date('2027-03-22'),
        value: 4999,
        status: 'AVAILABLE',
        description: '移动端兼容性测试。',
      },
      {
        name: '扫码枪',
        code: 'OFF-2026-013',
        type: '办公设备',
        brand: 'Honeywell',
        model: '1950GHD',
        location: '行政库房 D2',
        ownerId: admin.id,
        purchaseDate: new Date('2024-09-14'),
        warrantyExpireDate: new Date('2027-09-14'),
        value: 980,
        status: 'SCRAPPED',
        description: '扫描头损坏，已报废留档。',
      },
    ],
  });

  const camera = await prisma.device.findUniqueOrThrow({ where: { code: 'CAM-2026-001' } });
  const laptop = await prisma.device.findUniqueOrThrow({ where: { code: 'LAP-2026-002' } });
  const networkTester = await prisma.device.findUniqueOrThrow({ where: { code: 'NET-2026-003' } });
  await prisma.borrowRequest.create({
    data: {
      requestedName: camera.name,
      requestedType: camera.type,
      requestedBrand: camera.brand,
      requestedModel: camera.model,
      quantity: 1,
      applicantId: user.id,
      departmentId: product.id,
      borrowStartAt: new Date(Date.now() + 2 * 86400000),
      borrowEndAt: new Date(Date.now() + 4 * 86400000),
      purpose: '产品发布会现场拍摄',
      remark: '需要同时借用备用电池。',
      status: 'PENDING_APPROVAL',
    },
  });

  const laptopBorrow = await prisma.borrowRequest.create({
    data: {
      requestedName: laptop.name,
      requestedType: laptop.type,
      requestedBrand: laptop.brand,
      requestedModel: laptop.model,
      quantity: 1,
      applicantId: user2.id,
      departmentId: product.id,
      borrowStartAt: new Date(Date.now() - 2 * 86400000),
      borrowEndAt: new Date(Date.now() + 5 * 86400000),
      purpose: '短期开发联调',
      remark: '用于外出驻场排查问题。',
      status: 'PICKED_UP',
      pickedUpAt: new Date(Date.now() - 2 * 86400000),
    },
  });

  await prisma.borrowItem.create({
    data: {
      borrowRequestId: laptopBorrow.id,
      deviceId: laptop.id,
      status: 'PICKED_UP',
      pickedUpAt: laptopBorrow.pickedUpAt,
    },
  });

  await prisma.repairRecord.create({
    data: {
      deviceId: networkTester.id,
      faultDescription: '网线连通测试结果偶发跳变，需要检测接口模块。',
      status: 'REPAIRING',
      repairerId: repairer.id,
      cost: 0,
    },
  });

  await prisma.repairRecord.create({
    data: {
      deviceId: laptop.id,
      borrowRequestId: laptopBorrow.id,
      faultDescription: '历史异常归还记录：屏幕转轴异响，已完成维修留档。',
      status: 'FIXED',
      repairResultStatus: 'FIXED',
      repairerId: repairer2.id,
      repairEndAt: new Date(Date.now() - 86400000),
      result: '更换转轴组件并通过开合测试。',
      cost: 620,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: 'SEED_INITIAL_DATA',
      targetType: 'SYSTEM',
      detail: '初始化演示账号、设备和申请数据',
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
