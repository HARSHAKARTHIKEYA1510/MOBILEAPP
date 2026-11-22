import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  FileResponseDto,
  FileWithDataResponseDto,
  UploadFileDto,
} from './dto/file.dto';
import { FileService } from './file.service';

@ApiTags('files')
@ApiSecurity('basic-auth')
@Controller('file')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post()
  @ApiOperation({
    summary: 'Upload an image or file (base64)',
    description:
      'Uploads a file sent as base64 in a JSON body (max 10 MB). ' +
      'To send it in a chat, pass the returned `id` as `file_id` to `POST /message`.',
  })
  @ApiBody({ type: UploadFileDto })
  @ApiResponse({ status: 201, description: 'File stored', type: FileResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid base64 or empty file' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Authorization header' })
  @ApiResponse({ status: 413, description: 'File larger than 10 MB' })
  upload(@Body() body: UploadFileDto, @CurrentUser() user: any) {
    return this.fileService.uploadFile(body, user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a file as base64',
    description:
      'Returns file metadata and contents as base64. Allowed for uploader and conversation participants.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the file' })
  @ApiResponse({
    status: 200,
    description: 'File with base64 data',
    type: FileWithDataResponseDto,
  })
  getFile(@Param('id') id: string, @CurrentUser() user: any) {
    return this.fileService.getFile(id, user.id);
  }

  @Get(':id/download')
  @ApiOperation({
    summary: 'Download a file (raw bytes)',
    description: 'Returns original bytes with Content-Type.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the file' })
  async download(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const file = await this.fileService.getFile(id, user.id);
    const buf = Buffer.from(file.data, 'base64');
    const disposition = file.kind === 'IMAGE' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${file.name.replace(/"/g, '')}"`,
    );
    res.send(buf);
  }
}
