import type { UploadFile } from 'antd/es/upload/interface';
import { http } from '../api/http';

type UploadedFile = {
  name: string;
  url: string;
};

export async function uploadFiles(files: UploadFile[] = []) {
  const uploaded: UploadedFile[] = [];

  for (const file of files) {
    if (!file.originFileObj) {
      if (file.name && file.url) uploaded.push({ name: file.name, url: file.url });
      continue;
    }

    const formData = new FormData();
    formData.append('file', file.originFileObj);
    const result = await http.post('/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }) as unknown as UploadedFile;
    uploaded.push(result);
  }

  return uploaded;
}

export function serializeAttachments(files: UploadedFile[]) {
  return files.map((file) => `${file.name}|${file.url}`).join('\n');
}

export function parseAttachments(value?: string) {
  if (!value) return [];
  return value.split(/\n|、/).filter(Boolean).map((item) => {
    const [name, url] = item.split('|');
    return { name, url };
  });
}
