import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

type StaticRequest = { method: string; path: string };
type StaticResponse = { sendFile: (path: string) => void };
type StaticNext = () => void;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api');

  const corsOrigin = config.get<string>('CORS_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigin.length === 1 ? corsOrigin[0] : corsOrigin,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('设备借用与维修管理系统 API')
      .setDescription('设备、借用审批、归还维修和统计接口')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('docs', app, document);

  const defaultUploadsDir = existsSync('/data') ? '/data/uploads' : join(process.cwd(), 'uploads');
  const uploadsDir = config.get<string>('UPLOAD_DIR', defaultUploadsDir);
  mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });

  const clientDist = join(process.cwd(), '../client/dist');
  const clientIndex = join(clientDist, 'index.html');
  if (existsSync(clientIndex)) {
    app.useStaticAssets(clientDist, { index: false });
    app.use((request: StaticRequest, response: StaticResponse, next: StaticNext) => {
      const isApiRoute = request.path.startsWith('/api') || request.path.startsWith('/docs');

      if (request.method === 'GET' && !isApiRoute && !request.path.includes('.')) {
        response.sendFile(clientIndex);
        return;
      }
      next();
    });
  }

  const port = config.get<number>('PORT', 3000);
  const host = config.get<string>('HOST');
  if (host) {
    await app.listen(port, host);
  } else {
    await app.listen(port);
  }
}

bootstrap();
