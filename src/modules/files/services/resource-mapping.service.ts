import { Injectable } from '@nestjs/common';
import type { QueryRunner } from 'typeorm';
import { FileVisibility } from '../../../common/enums/file.enums';
import { AppException } from '../../../common/exceptions/app.exception';
import { FileCategory } from '../enums/file-category.enum';
import { ResourceType } from '../enums/resource-type.enum';
import type {
  ResourceAssociationInput,
  ResourceMapper,
  ResourceMappingDefinition,
} from '../interfaces/resource-mapping.interface';

const DIRECT = (
  resourceType: ResourceType,
  sourceModel: string,
  sourceFile: string,
  schema: string,
  table: string,
  fileColumn: string,
  category: FileCategory,
  visibility: FileVisibility,
  softDelete: boolean,
): ResourceMappingDefinition => ({
  resourceType,
  sourceModel,
  sourceFile,
  schema,
  table,
  ownerType: `${schema}.${table}`,
  category,
  allowedVisibilities: [visibility],
  softDelete,
  fileColumn,
  associationKind: 'direct',
});

const DEFINITIONS: Record<ResourceType, ResourceMappingDefinition> = {
  [ResourceType.BRAND_LOGO]: DIRECT(
    ResourceType.BRAND_LOGO,
    'Brands',
    'app/models/catalog.py',
    'catalog',
    'brands',
    'logo_file_id',
    FileCategory.BRAND_LOGO,
    FileVisibility.PUBLIC,
    true,
  ),
  [ResourceType.USER_AVATAR]: DIRECT(
    ResourceType.USER_AVATAR,
    'UserProfiles',
    'app/models/identity.py',
    'identity',
    'user_profiles',
    'avatar_file_id',
    FileCategory.PROFILE_IMAGE,
    FileVisibility.PUBLIC,
    true,
  ),
  [ResourceType.CUSTOMER_AVATAR]: DIRECT(
    ResourceType.CUSTOMER_AVATAR,
    'Profiles',
    'app/models/customer.py',
    'customer',
    'profiles',
    'avatar_file_id',
    FileCategory.PROFILE_IMAGE,
    FileVisibility.PUBLIC,
    true,
  ),
  [ResourceType.PRODUCT_MEDIA]: {
    resourceType: ResourceType.PRODUCT_MEDIA,
    sourceModel: 'ProductMedia',
    sourceFile: 'app/models/catalog.py',
    schema: 'catalog',
    table: 'product_media',
    ownerType: 'catalog.products',
    category: FileCategory.PRODUCT_IMAGE,
    allowedVisibilities: [FileVisibility.PUBLIC],
    softDelete: true,
    associationKind: 'link',
    existsSchema: 'catalog',
    existsTable: 'products',
  },
  [ResourceType.PRESCRIPTION_DOCUMENT]: {
    resourceType: ResourceType.PRESCRIPTION_DOCUMENT,
    sourceModel: 'PrescriptionDocuments',
    sourceFile: 'app/models/clinical.py',
    schema: 'clinical',
    table: 'prescription_documents',
    ownerType: 'clinical.prescriptions',
    category: FileCategory.PRESCRIPTION,
    allowedVisibilities: [FileVisibility.PRIVATE],
    softDelete: false,
    associationKind: 'link',
    existsSchema: 'clinical',
    existsTable: 'prescriptions',
  },
  [ResourceType.DIAGNOSTIC_REPORT]: DIRECT(
    ResourceType.DIAGNOSTIC_REPORT,
    'DiagnosticReports',
    'app/models/diagnostics.py',
    'diagnostics',
    'diagnostic_reports',
    'file_object_id',
    FileCategory.LABORATORY_REPORT,
    FileVisibility.PRIVATE,
    false,
  ),
  [ResourceType.ORGANIZATION_LICENSE_DOCUMENT]: DIRECT(
    ResourceType.ORGANIZATION_LICENSE_DOCUMENT,
    'Licenses',
    'app/models/organization.py',
    'organization',
    'licenses',
    'document_file_id',
    FileCategory.ORGANIZATION_DOCUMENT,
    FileVisibility.PRIVATE,
    true,
  ),
  [ResourceType.REGULATORY_REGISTRATION_DOCUMENT]: DIRECT(
    ResourceType.REGULATORY_REGISTRATION_DOCUMENT,
    'RegulatoryRegistrations',
    'app/models/compliance.py',
    'compliance',
    'regulatory_registrations',
    'document_file_id',
    FileCategory.ORGANIZATION_DOCUMENT,
    FileVisibility.PRIVATE,
    true,
  ),
  [ResourceType.INSURANCE_CLAIM_DOCUMENT]: {
    resourceType: ResourceType.INSURANCE_CLAIM_DOCUMENT,
    sourceModel: 'ClaimDocuments',
    sourceFile: 'app/models/insurance.py',
    schema: 'insurance',
    table: 'claim_documents',
    ownerType: 'insurance.claims',
    category: FileCategory.MEDICAL_REPORT,
    allowedVisibilities: [FileVisibility.PRIVATE],
    softDelete: false,
    associationKind: 'link',
    existsSchema: 'insurance',
    existsTable: 'claims',
  },
  [ResourceType.SUPPORT_TICKET_ATTACHMENT]: {
    resourceType: ResourceType.SUPPORT_TICKET_ATTACHMENT,
    sourceModel: 'TicketAttachments',
    sourceFile: 'app/models/support.py',
    schema: 'support',
    table: 'ticket_attachments',
    ownerType: 'support.tickets',
    category: FileCategory.SUPPORT_ATTACHMENT,
    allowedVisibilities: [FileVisibility.PRIVATE],
    softDelete: false,
    associationKind: 'link',
    existsSchema: 'support',
    existsTable: 'tickets',
  },
  [ResourceType.FINANCE_INVOICE_DOCUMENT]: DIRECT(
    ResourceType.FINANCE_INVOICE_DOCUMENT,
    'Invoices',
    'app/models/finance.py',
    'finance',
    'invoices',
    'document_file_id',
    FileCategory.INVOICE_DOCUMENT,
    FileVisibility.PRIVATE,
    false,
  ),
  [ResourceType.FINANCE_CREDIT_NOTE_DOCUMENT]: DIRECT(
    ResourceType.FINANCE_CREDIT_NOTE_DOCUMENT,
    'CreditNotes',
    'app/models/finance.py',
    'finance',
    'credit_notes',
    'document_file_id',
    FileCategory.INVOICE_DOCUMENT,
    FileVisibility.PRIVATE,
    false,
  ),
  [ResourceType.SHIPMENT_LABEL]: DIRECT(
    ResourceType.SHIPMENT_LABEL,
    'Shipments',
    'app/models/logistics.py',
    'logistics',
    'shipments',
    'shipping_label_file_id',
    FileCategory.SHIPPING_DOCUMENT,
    FileVisibility.PRIVATE,
    false,
  ),
  [ResourceType.DELIVERY_PROOF]: DIRECT(
    ResourceType.DELIVERY_PROOF,
    'DeliveryAttempts',
    'app/models/logistics.py',
    'logistics',
    'delivery_attempts',
    'proof_file_id',
    FileCategory.SHIPPING_DOCUMENT,
    FileVisibility.PRIVATE,
    false,
  ),
  [ResourceType.TELECONSULTATION_RECORDING]: DIRECT(
    ResourceType.TELECONSULTATION_RECORDING,
    'TeleconsultationSessions',
    'app/models/appointment.py',
    'appointment',
    'teleconsultation_sessions',
    'recording_file_id',
    FileCategory.MEDICAL_REPORT,
    FileVisibility.PRIVATE,
    false,
  ),
  [ResourceType.PAYMENT_RECONCILIATION_SOURCE]: DIRECT(
    ResourceType.PAYMENT_RECONCILIATION_SOURCE,
    'ReconciliationRuns',
    'app/models/payment.py',
    'payment',
    'reconciliation_runs',
    'source_file_id',
    FileCategory.INVOICE_DOCUMENT,
    FileVisibility.PRIVATE,
    false,
  ),
  [ResourceType.SUPPLIER_LICENSE_DOCUMENT]: DIRECT(
    ResourceType.SUPPLIER_LICENSE_DOCUMENT,
    'SupplierLicenses',
    'app/models/procurement.py',
    'procurement',
    'supplier_licenses',
    'document_file_id',
    FileCategory.ORGANIZATION_DOCUMENT,
    FileVisibility.PRIVATE,
    true,
  ),
  [ResourceType.SUPPLIER_INVOICE_DOCUMENT]: DIRECT(
    ResourceType.SUPPLIER_INVOICE_DOCUMENT,
    'SupplierInvoices',
    'app/models/procurement.py',
    'procurement',
    'supplier_invoices',
    'document_file_id',
    FileCategory.INVOICE_DOCUMENT,
    FileVisibility.PRIVATE,
    false,
  ),
  [ResourceType.NOTIFICATION_ATTACHMENT]: {
    resourceType: ResourceType.NOTIFICATION_ATTACHMENT,
    sourceModel: 'MessageAttachments',
    sourceFile: 'app/models/notification.py',
    schema: 'notification',
    table: 'message_attachments',
    ownerType: 'notification.messages',
    category: FileCategory.NOTIFICATION_ATTACHMENT,
    allowedVisibilities: [FileVisibility.PRIVATE],
    softDelete: false,
    associationKind: 'link',
    existsSchema: 'notification',
    existsTable: 'messages',
  },
  [ResourceType.IN_APP_NOTIFICATION_IMAGE]: DIRECT(
    ResourceType.IN_APP_NOTIFICATION_IMAGE,
    'InAppNotifications',
    'app/models/notification.py',
    'notification',
    'in_app_notifications',
    'image_file_id',
    FileCategory.PRODUCT_IMAGE,
    FileVisibility.PUBLIC,
    true,
  ),
};

@Injectable()
export class ResourceMappingService implements ResourceMapper {
  definition(resourceType: ResourceType): ResourceMappingDefinition {
    const definition = DEFINITIONS[resourceType];
    if (!definition) {
      throw new AppException('INVALID_RESOURCE_TYPE', 'The resource type is not supported.', 422);
    }
    return definition;
  }

  validate(input: {
    resourceType: ResourceType;
    resourceId: string;
    visibility: FileVisibility;
    category: FileCategory;
    metadata: Record<string, unknown>;
  }): void {
    const definition = this.definition(input.resourceType);
    if (!definition.allowedVisibilities.includes(input.visibility)) {
      throw new AppException(
        'VISIBILITY_NOT_ALLOWED',
        'The selected visibility is not allowed for this resource type.',
        422,
        { allowed: definition.allowedVisibilities },
      );
    }
    if (definition.category !== input.category) {
      throw new AppException(
        'FILE_CATEGORY_MISMATCH',
        'The file category does not match the resource type.',
        422,
        { expected: definition.category },
      );
    }
    this.validateMetadata(input.resourceType, input.metadata);
  }

  async assertResourceExists(
    queryRunner: QueryRunner,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<void> {
    const definition = this.definition(resourceType);
    const schema = definition.existsSchema ?? definition.schema;
    const table = definition.existsTable ?? definition.table;
    const condition = definition.softDelete && !definition.existsTable ? ' AND is_deleted = false' : '';
    const rows = (await queryRunner.query(
      `SELECT id FROM "${schema}"."${table}" WHERE id = $1${condition} LIMIT 1`,
      [resourceId],
    )) as Array<{ id: string }>;
    if (rows.length === 0) {
      throw new AppException('RESOURCE_NOT_FOUND', 'The associated resource was not found.', 404);
    }
  }

  async associate(queryRunner: QueryRunner, input: ResourceAssociationInput): Promise<void> {
    const definition = this.definition(input.resourceType);
    if (definition.associationKind === 'direct') {
      await this.updateDirect(queryRunner, definition, input.resourceId, input.fileId, input.actorId);
      return;
    }
    await this.insertLink(queryRunner, input);
  }

  async replaceAssociation(
    queryRunner: QueryRunner,
    resourceType: ResourceType,
    resourceId: string,
    oldFileId: string,
    newFileId: string,
    metadata: Record<string, unknown>,
    actorId: string | null,
  ): Promise<void> {
    const definition = this.definition(resourceType);
    if (definition.associationKind === 'direct') {
      await this.updateDirect(queryRunner, definition, resourceId, newFileId, actorId, oldFileId);
      return;
    }
    const result = await queryRunner.query(
      `UPDATE "${definition.schema}"."${definition.table}" SET file_object_id = $1, updated_at = now(), updated_by = $2, row_version = row_version + 1 WHERE file_object_id = $3 RETURNING id`,
      [newFileId, actorId, oldFileId],
    );
    if ((result as Array<{ id: string }>).length === 0) {
      await this.insertLink(queryRunner, {
        resourceType,
        resourceId,
        fileId: newFileId,
        visibility: definition.allowedVisibilities[0]!,
        category: definition.category,
        metadata,
        actorId,
      });
    }
  }

  async clearAssociation(
    queryRunner: QueryRunner,
    resourceType: ResourceType,
    fileId: string,
    actorId: string | null,
  ): Promise<void> {
    const definition = this.definition(resourceType);
    if (definition.associationKind === 'direct') {
      await queryRunner.query(
        `UPDATE "${definition.schema}"."${definition.table}" SET "${definition.fileColumn}" = NULL, updated_at = now(), updated_by = $1, row_version = row_version + 1 WHERE "${definition.fileColumn}" = $2`,
        [actorId, fileId],
      );
      return;
    }
    if (definition.softDelete) {
      await queryRunner.query(
        `UPDATE "${definition.schema}"."${definition.table}" SET is_deleted = true, deleted_at = now(), deleted_by = $1, updated_at = now(), updated_by = $1, row_version = row_version + 1 WHERE file_object_id = $2 AND is_deleted = false`,
        [actorId, fileId],
      );
    } else {
      await queryRunner.query(
        `DELETE FROM "${definition.schema}"."${definition.table}" WHERE file_object_id = $1`,
        [fileId],
      );
    }
  }

  async currentFileId(
    queryRunner: QueryRunner,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<string | null> {
    const definition = this.definition(resourceType);
    if (definition.associationKind !== 'direct') {
      return null;
    }
    const rows = (await queryRunner.query(
      `SELECT "${definition.fileColumn}" AS file_id FROM "${definition.schema}"."${definition.table}" WHERE id = $1 LIMIT 1`,
      [resourceId],
    )) as Array<{ file_id: string | null }>;
    return rows[0]?.file_id ?? null;
  }

  listDefinitions(): ResourceMappingDefinition[] {
    return Object.values(DEFINITIONS);
  }

  private async updateDirect(
    queryRunner: QueryRunner,
    definition: ResourceMappingDefinition,
    resourceId: string,
    fileId: string,
    actorId: string | null,
    expectedOldFileId?: string,
  ): Promise<void> {
    const softDelete = definition.softDelete ? ' AND is_deleted = false' : '';
    const optimistic = expectedOldFileId ? ` AND "${definition.fileColumn}" = $4` : '';
    const parameters: unknown[] = [fileId, actorId, resourceId];
    if (expectedOldFileId) parameters.push(expectedOldFileId);
    const rows = (await queryRunner.query(
      `UPDATE "${definition.schema}"."${definition.table}" SET "${definition.fileColumn}" = $1, updated_at = now(), updated_by = $2, row_version = row_version + 1 WHERE id = $3${softDelete}${optimistic} RETURNING id`,
      parameters,
    )) as Array<{ id: string }>;
    if (rows.length === 0) {
      throw new AppException(
        expectedOldFileId ? 'FILE_ALREADY_REPLACED' : 'RESOURCE_NOT_FOUND',
        expectedOldFileId
          ? 'The file reference changed before replacement completed.'
          : 'The associated resource was not found.',
        expectedOldFileId ? 409 : 404,
      );
    }
  }

  private async insertLink(queryRunner: QueryRunner, input: ResourceAssociationInput): Promise<void> {
    switch (input.resourceType) {
      case ResourceType.PRODUCT_MEDIA: {
        const variantId = this.optionalUuid(input.metadata.variantId);
        if (variantId) {
          const variants = (await queryRunner.query(
            `SELECT id FROM catalog.product_variants WHERE id = $1 AND product_id = $2 AND is_deleted = false LIMIT 1`,
            [variantId, input.resourceId],
          )) as Array<{ id: string }>;
          if (variants.length === 0) {
            throw new AppException(
              'INVALID_RESOURCE_METADATA',
              'The selected product variant does not belong to the product.',
              422,
            );
          }
        }
        await queryRunner.query(
          `INSERT INTO catalog.product_media (product_id, variant_id, media_type, file_object_id, alt_text, display_order, is_primary, created_by, updated_by) VALUES ($1,$2,'image',$3,$4,$5,$6,$7,$7)`,
          [
            input.resourceId,
            variantId,
            input.fileId,
            this.optionalString(input.metadata.altText, 255),
            this.integerValue(input.metadata.displayOrder, 0, 0),
            this.booleanValue(input.metadata.isPrimary, false),
            input.actorId,
          ],
        );
        break;
      }
      case ResourceType.PRESCRIPTION_DOCUMENT:
        await queryRunner.query(
          `INSERT INTO clinical.prescription_documents (prescription_id, file_object_id, created_by, updated_by) VALUES ($1,$2,$3,$3)`,
          [input.resourceId, input.fileId, input.actorId],
        );
        break;
      case ResourceType.INSURANCE_CLAIM_DOCUMENT:
        await queryRunner.query(
          `INSERT INTO insurance.claim_documents (claim_id, document_type, file_object_id, created_by, updated_by) VALUES ($1,$2,$3,$4,$4)`,
          [
            input.resourceId,
            this.requiredString(input.metadata.documentType, 'documentType', 64),
            input.fileId,
            input.actorId,
          ],
        );
        break;
      case ResourceType.SUPPORT_TICKET_ATTACHMENT: {
        const ticketMessageId = this.optionalUuid(input.metadata.ticketMessageId);
        if (ticketMessageId) {
          const messages = (await queryRunner.query(
            `SELECT id FROM support.ticket_messages WHERE id = $1 AND ticket_id = $2 LIMIT 1`,
            [ticketMessageId, input.resourceId],
          )) as Array<{ id: string }>;
          if (messages.length === 0) {
            throw new AppException(
              'INVALID_RESOURCE_METADATA',
              'The selected ticket message does not belong to the ticket.',
              422,
            );
          }
        }
        await queryRunner.query(
          `INSERT INTO support.ticket_attachments (ticket_id, ticket_message_id, file_object_id, created_by, updated_by) VALUES ($1,$2,$3,$4,$4)`,
          [input.resourceId, ticketMessageId, input.fileId, input.actorId],
        );
        break;
      }
      case ResourceType.NOTIFICATION_ATTACHMENT:
        await queryRunner.query(
          `INSERT INTO notification.message_attachments (message_id, file_object_id, disposition, filename, content_id, display_order, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
          [
            input.resourceId,
            input.fileId,
            this.stringValue(input.metadata.disposition, 'attachment', 16),
            this.optionalString(input.metadata.filename, 255),
            this.optionalString(input.metadata.contentId, 255),
            this.integerValue(input.metadata.displayOrder, 0, 0),
            input.actorId,
          ],
        );
        break;
      default:
        throw new AppException('RESOURCE_MAPPING_ERROR', 'The resource mapping is incomplete.', 500);
    }
  }

  private validateMetadata(resourceType: ResourceType, metadata: Record<string, unknown>): void {
    const allowedKeys: Partial<Record<ResourceType, readonly string[]>> = {
      [ResourceType.PRODUCT_MEDIA]: [
        'variantId',
        'altText',
        'displayOrder',
        'isPrimary',
      ],
      [ResourceType.INSURANCE_CLAIM_DOCUMENT]: ['documentType'],
      [ResourceType.SUPPORT_TICKET_ATTACHMENT]: ['ticketMessageId'],
      [ResourceType.NOTIFICATION_ATTACHMENT]: [
        'disposition',
        'filename',
        'contentId',
        'displayOrder',
      ],
    };
    const allowed = new Set(allowedKeys[resourceType] ?? []);
    const unknownKeys = Object.keys(metadata).filter((key) => !allowed.has(key));
    if (unknownKeys.length > 0) {
      throw new AppException(
        'INVALID_RESOURCE_METADATA',
        'Resource metadata contains unsupported fields.',
        422,
        { fields: unknownKeys },
      );
    }
    if (resourceType === ResourceType.INSURANCE_CLAIM_DOCUMENT) {
      this.requiredString(metadata.documentType, 'documentType', 64);
    }
    if (resourceType === ResourceType.PRODUCT_MEDIA) {
      this.optionalUuid(metadata.variantId);
      this.integerValue(metadata.displayOrder, 0, 0);
      this.booleanValue(metadata.isPrimary, false);
    }
    if (resourceType === ResourceType.SUPPORT_TICKET_ATTACHMENT) {
      this.optionalUuid(metadata.ticketMessageId);
    }
    if (resourceType === ResourceType.NOTIFICATION_ATTACHMENT) {
      const disposition = this.stringValue(metadata.disposition, 'attachment', 16);
      if (!['attachment', 'inline'].includes(disposition)) {
        throw new AppException(
          'INVALID_RESOURCE_METADATA',
          'Notification disposition must be attachment or inline.',
          422,
        );
      }
      this.integerValue(metadata.displayOrder, 0, 0);
    }
  }

  private requiredString(value: unknown, field: string, maxLength: number): string {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
      throw new AppException(
        'INVALID_RESOURCE_METADATA',
        `Resource metadata field ${field} is required and must be at most ${maxLength} characters.`,
        422,
      );
    }
    return value.trim();
  }

  private stringValue(value: unknown, fallback: string, maxLength: number): string {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value !== 'string' || value.trim().length > maxLength) {
      throw new AppException('INVALID_RESOURCE_METADATA', 'Resource metadata is invalid.', 422);
    }
    return value.trim();
  }

  private optionalString(value: unknown, maxLength: number): string | null {
    if (value === undefined || value === null || value === '') return null;
    return this.stringValue(value, '', maxLength);
  }

  private optionalUuid(value: unknown): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new AppException('INVALID_RESOURCE_METADATA', 'A resource metadata UUID is invalid.', 422);
    }
    return value;
  }

  private integerValue(value: unknown, fallback: number, minimum: number): number {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum) {
      throw new AppException('INVALID_RESOURCE_METADATA', 'A resource metadata integer is invalid.', 422);
    }
    return parsed;
  }

  private booleanValue(value: unknown, fallback: boolean): boolean {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new AppException('INVALID_RESOURCE_METADATA', 'A resource metadata boolean is invalid.', 422);
  }
}
