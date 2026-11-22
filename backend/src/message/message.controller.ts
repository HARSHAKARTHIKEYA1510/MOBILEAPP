import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Query,
  Body,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBody,
  ApiParam,
  ApiSecurity,
} from '@nestjs/swagger';
import { MessageService } from './message.service';
import {
  GetMessagesDto,
  GetArchivedMessagesDto,
  CreateMessageDto,
  MessageResponseDto,
  PaginatedMessagesResponseDto,
} from './dto/message.dto';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('messages')
@ApiSecurity('basic-auth')
@Controller('message')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get('archived')
  @ApiOperation({
    summary: 'Get archived (deleted) messages',
    description:
      'Returns all messages that were deleted and moved to the archive. ' +
      'Optionally pass `conversation_id` to filter archived messages for a single conversation.',
  })
  @ApiQuery({
    name: 'conversation_id',
    required: false,
    description: 'Optional MongoDB ObjectId of a conversation',
  })
  getArchivedMessages(
    @Query() query: GetArchivedMessagesDto,
    @CurrentUser() user: any,
  ) {
    return this.messageService.getArchivedMessages(
      user.id,
      query.conversation_id,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Get paginated messages',
    description:
      'Fetches messages for a conversation using cursor-based pagination. ' +
      'First call: omit from_message_cursor. ' +
      'Subsequent calls: pass the returned nextCursor to load older messages.',
  })
  @ApiQuery({
    name: 'conversation_id',
    description: 'MongoDB ObjectId of the target conversation',
    example: '64b8f9e2c4a3b12d4e5f0001',
  })
  @ApiQuery({
    name: 'from_message_cursor',
    required: false,
    description: 'ObjectId of the last fetched message. Omit for the first page.',
    example: '64b8f9e2c4a3b12d4e5f1234',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated messages',
    type: PaginatedMessagesResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Authorization header' })
  @ApiResponse({ status: 404, description: 'Cursor message not found' })
  getMessages(@Query() query: GetMessagesDto) {
    return this.messageService.getMessages(
      query.conversation_id,
      query.from_message_cursor,
    );
  }

  @Post('upload')
  @ApiOperation({
    summary: 'Upload base64 image and return a static file URL',
  })
  uploadImage(
    @Body() body: { dataUri: string; hostIp?: string },
    @Req() req: Request,
  ) {
    const raw = body?.dataUri || '';
    const match = raw.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!match) {
      return { url: raw };
    }
    const ext = match[1] === 'png' ? 'png' : 'jpg';
    const base64Data = match[2];
    const uploadsDir = fs.existsSync(path.join(process.cwd(), 'package.json'))
      ? path.join(process.cwd(), 'uploads')
      : path.join(__dirname, '..', '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const fileName = `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    const host = body?.hostIp || req.headers.host || 'localhost:3001';
    return { url: `http://${host}/uploads/${fileName}` };
  }

  @Post()
  @ApiOperation({
    summary: 'Send a message',
    description:
      'Creates a new message in the specified conversation. ' +
      'The sender is identified from the `Authorization: Basic <username>:<password>` header — ' +
      'no sender_id needed in the body. ' +
      'Delivery/read status is automatically initialized for all participants.',
  })
  @ApiBody({ type: CreateMessageDto })
  @ApiResponse({
    status: 201,
    description: 'Message created',
    type: MessageResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Authorization header' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  createMessage(@Body() body: CreateMessageDto, @CurrentUser() user: any) {
    return this.messageService.createMessage(body, user.id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a message (moves to Archive)',
    description:
      'Soft-deletes a message from the active conversation and moves it into the Archive.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the message' })
  archiveMessage(@Param('id') id: string, @CurrentUser() user: any) {
    return this.messageService.archiveMessage(id, user.id);
  }

  @Patch(':id/restore')
  @ApiOperation({
    summary: 'Restore an archived message back to chat',
    description: 'Moves an archived message back into its active conversation.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the message' })
  restoreMessage(@Param('id') id: string, @CurrentUser() user: any) {
    return this.messageService.restoreMessage(id, user.id);
  }

  @Delete(':id/permanent')
  @ApiOperation({
    summary: 'Permanently delete an archived message',
    description: 'Permanently removes the message from the database.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the message' })
  permanentlyDeleteMessage(@Param('id') id: string, @CurrentUser() user: any) {
    return this.messageService.permanentlyDeleteMessage(id, user.id);
  }
}
