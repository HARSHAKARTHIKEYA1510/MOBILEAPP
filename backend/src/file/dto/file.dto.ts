import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UploadFileDto {
  @ApiProperty({
    description: 'Original file name, shown to other users and used for downloads',
    example: 'holiday.jpg',
    maxLength: 255,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  file_name: string;

  @ApiPropertyOptional({
    description:
      'MIME type of the file. Optional when `data` is a data URL or a recognised image format.',
    example: 'image/jpeg',
  })
  @IsOptional()
  @IsString()
  mime_type?: string;

  @ApiProperty({
    description:
      'File contents encoded as base64 (plain base64 or data:<mime>;base64,... URI).',
    example:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  })
  @IsString()
  @MinLength(1)
  data: string;
}

export class FileResponseDto {
  @ApiProperty({ example: '64b8f9e2c4a3b12d4e5f9001' })
  id: string;

  @ApiProperty({ example: 'holiday.jpg' })
  name: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType: string;

  @ApiProperty({ example: 48213 })
  size: number;

  @ApiProperty({ enum: ['IMAGE', 'FILE'], example: 'IMAGE' })
  kind: string;

  @ApiProperty({ example: '64b8f9e2c4a3b12d4e5f6789' })
  uploadedBy: string;

  @ApiProperty({ example: '2024-01-15T10:34:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '/file/64b8f9e2c4a3b12d4e5f9001/download' })
  downloadUrl: string;
}

export class FileWithDataResponseDto extends FileResponseDto {
  @ApiProperty({
    description: 'File contents as plain base64.',
    example:
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  })
  data: string;
}
