import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type RequestUser = {
  id: string;
  username: string;
  name: string;
  role: string;
  departmentId?: string | null;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser => {
    const request = context.switchToHttp().getRequest<{ user: RequestUser }>();
    return request.user;
  },
);
