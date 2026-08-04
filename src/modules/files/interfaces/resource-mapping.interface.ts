import type { QueryRunner } from 'typeorm';
import type { FileVisibility } from '../../../common/enums/file.enums';
import type { FileCategory } from '../enums/file-category.enum';
import type { ResourceType } from '../enums/resource-type.enum';

export interface ResourceAssociationInput {
  resourceType: ResourceType;
  resourceId: string;
  fileId: string;
  visibility: FileVisibility;
  category: FileCategory;
  metadata: Record<string, unknown>;
  actorId: string | null;
}

export interface ResourceMappingDefinition {
  resourceType: ResourceType;
  sourceModel: string;
  sourceFile: string;
  schema: string;
  table: string;
  ownerType: string;
  category: FileCategory;
  allowedVisibilities: readonly FileVisibility[];
  softDelete: boolean;
  fileColumn?: string;
  associationKind: 'direct' | 'link';
  existsTable?: string;
  existsSchema?: string;
}

export interface ResourceMapper {
  definition(resourceType: ResourceType): ResourceMappingDefinition;
  validate(input: Omit<ResourceAssociationInput, 'fileId' | 'actorId'>): void;
  assertResourceExists(
    queryRunner: QueryRunner,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<void>;
  associate(queryRunner: QueryRunner, input: ResourceAssociationInput): Promise<void>;
  replaceAssociation(
    queryRunner: QueryRunner,
    resourceType: ResourceType,
    resourceId: string,
    oldFileId: string,
    newFileId: string,
    metadata: Record<string, unknown>,
    actorId: string | null,
  ): Promise<void>;
  clearAssociation(
    queryRunner: QueryRunner,
    resourceType: ResourceType,
    fileId: string,
    actorId: string | null,
  ): Promise<void>;
  currentFileId(
    queryRunner: QueryRunner,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<string | null>;
}
