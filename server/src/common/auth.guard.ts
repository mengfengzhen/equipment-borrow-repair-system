import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from './current-user.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: RequestUser;
    }>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined;

    if (!token) {
      throw new UnauthorizedException('请先登录');
    }

    let payload: RequestUser;
    try {
      payload = this.jwtService.verify<RequestUser>(token);
    } catch {
      throw new UnauthorizedException('登录状态已失效');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        departmentId: true,
        active: true,
      },
    });

    if (!user?.active) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }

    request.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      departmentId: user.departmentId,
    };
    return true;
  }
}
