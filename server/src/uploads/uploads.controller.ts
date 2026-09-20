import { Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../common/auth.guard';

const { diskStorage } = require('multer') as {
  diskStorage: (options: unknown) => unknown;
};

type UploadedLocalFile = {
  originalname: string;
  filename: string;
  size: number;
};

@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  @Post()
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (
        _request: unknown,
        _file: { originalname?: string },
        callback: (error: Error | null, destination: string) => void,
      ) => {
        const destination = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
        mkdirSync(destination, { recursive: true });
        callback(null, destination);
      },
      filename: (
        _request: unknown,
        file: { originalname?: string },
        callback: (error: Error | null, filename: string) => void,
      ) => {
        const safeExt = extname(file.originalname || '');
        callback(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
  }))
  upload(@UploadedFile() file: UploadedLocalFile) {
    return {
      name: file.originalname,
      url: `/uploads/${file.filename}`,
      size: file.size,
    };
  }
}
