import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Roles } from '../common/constants';
import { RequestUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(currentUser: RequestUser) {
    return this.prisma.user.findMany({
      where: currentUser.role === Roles.MANAGER ? { departmentId: currentUser.departmentId } : undefined,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        phone: true,
        email: true,
        active: true,
        department: { select: { id: true, name: true } },
      },
    });
  }

  async create(dto: CreateUserDto, currentUser: RequestUser) {
    if (currentUser.role === Roles.MANAGER) {
      if (dto.role !== Roles.USER) {
        throw new BadRequestException('部门负责人只能新增普通员工账号');
      }
      if (!currentUser.departmentId || dto.departmentId !== currentUser.departmentId) {
        throw new BadRequestException('部门负责人只能新增本部门账号');
      }
    }

    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) {
      throw new BadRequestException('账号已存在');
    }

    const department = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
    if (!department) {
      throw new BadRequestException('部门不存在');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        name: dto.name,
        role: dto.role,
        departmentId: dto.departmentId,
        phone: dto.phone,
        email: dto.email,
        active: dto.active ?? true,
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        phone: true,
        email: true,
        active: true,
        department: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, dto: UpdateUserDto, currentUser: RequestUser) {
    if (id === currentUser.id && dto.active === false) {
      throw new BadRequestException('不能停用当前登录账号');
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    if (dto.departmentId) {
      const department = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!department) {
        throw new BadRequestException('部门不存在');
      }
    }

    if (id === currentUser.id && dto.role && dto.role !== Roles.ADMIN) {
      throw new BadRequestException('不能修改当前登录管理员的角色');
    }

    const { departmentId, ...userData } = dto;

    return this.prisma.user.update({
      where: { id },
      data: {
        ...userData,
        ...(departmentId ? { department: { connect: { id: departmentId } } } : {}),
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        phone: true,
        email: true,
        active: true,
        department: { select: { id: true, name: true } },
      },
    });
  }

  async departments() {
    return this.prisma.department.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        users: {
          select: { id: true, name: true, username: true, role: true },
        },
      },
    });
  }
}
