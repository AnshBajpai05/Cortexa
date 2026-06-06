import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateWorkflowDto {
  @IsString()
  workspaceId: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsObject()
  @IsOptional()
  jsonGraph?: Record<string, unknown>;
}

export class UpdateWorkflowDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsObject()
  @IsOptional()
  jsonGraph?: Record<string, unknown>;
}
