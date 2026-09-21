import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      include: { department: true },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const matched = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matched) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const payload = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      departmentId: user.departmentId,
    };

    return {
      token: this.jwtService.sign(payload),
      user: {
        ...payload,
        department: user.department?.name,
      },
    };
  }

  async departments() {
    return this.prisma.department.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
  }

  async demoAccounts() {
    const demoOrder = ['admin', 'manager', 'user', 'repair'];
    const users = await this.prisma.user.findMany({
      where: { username: { in: demoOrder } },
      select: {
        username: true,
        name: true,
        role: true,
        active: true,
      },
    });
    const userMap = new Map(users.map((user) => [user.username, user]));

    return demoOrder
      .map((username) => userMap.get(username))
      .filter((user): user is (typeof users)[number] => Boolean(user));
  }
}
