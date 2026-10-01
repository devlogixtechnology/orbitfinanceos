import { z } from "zod";

export const uuidSchema = z.uuid();
export const utcInstantSchema = z
  .iso.datetime({ offset: false })
  .refine((value) => value.endsWith("Z"), "Timestamp must be a UTC instant");
export const unsignedIntegerStringSchema = z.string().regex(/^(?:0|[1-9]\d*)$/u);
export const atomicAmountSchema = z.string().regex(/^-?(?:0|[1-9]\d*)$/u);
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
export const authorizationValueSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?::[a-z][a-z0-9_-]*)+$/u);

export const sourceLifecycleSchema = z.enum([
  "observed",
  "quarantined",
  "superseded",
]);
export const finalityStateSchema = z.enum([
  "unknown",
  "pending",
  "final",
  "orphaned",
]);
export const verificationStateSchema = z.enum([
  "pending",
  "verified",
  "degraded",
  "conflicted",
  "superseded",
  "invalidated",
]);
export const reconciliationStateSchema = z.enum([
  "not_started",
  "matched",
  "mismatched",
  "timing_difference",
]);
export const restrictionStateSchema = z.enum([
  "not_screened",
  "clear",
  "restricted",
  "under_review",
]);
export const accountingReadinessSchema = z.enum([
  "blocked",
  "ready",
  "posted",
]);
export const executionStateSchema = z.enum(["unknown", "succeeded", "failed"]);
export const inclusionStateSchema = z.enum([
  "unknown",
  "pending",
  "included",
  "not_included",
]);
export const providerAgreementStateSchema = z.enum([
  "unavailable",
  "pending",
  "agreed",
  "degraded",
  "conflicted",
]);

export const bscChainIdSchema = z.enum(["56", "97"]);
export const evmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/u);
export const walletAddressSchema = z.string().trim().min(1).max(128);
export const integrationProviderGroupInputSchema = z
  .object({
    endpointReference: z.string().min(1),
    groupId: z.string().min(1),
    independenceGroup: z.string().min(1),
    secretReference: z.string().min(1).optional(),
  })
  .strict();
export const integrationProviderGroupSchema = z
  .object({
    groupId: z.string().min(1),
    hasSecretReference: z.boolean(),
    independenceGroup: z.string().min(1),
  })
  .strict();
export const createIntegrationRequestSchema = z
  .object({
    customerId: uuidSchema.optional(),
    finalityPolicyVersion: z.string().min(1),
    network: z
      .object({
        chainId: bscChainIdSchema,
        family: z.literal("evm"),
      })
      .strict(),
    provider: z.literal("bsc-json-rpc"),
    providerGroups: z.array(integrationProviderGroupInputSchema).min(1).max(4),
    schemaVersion: z.literal("1"),
    startingBlock: unsignedIntegerStringSchema,
    tokenContracts: z.array(evmAddressSchema).min(1).max(100),
    walletAddresses: z.array(evmAddressSchema).min(1).max(100),
  })
  .strict();
export const integrationSchema = z
  .object({
    createdAt: utcInstantSchema,
    customerId: uuidSchema.optional(),
    enabled: z.boolean(),
    finalityPolicyVersion: z.string().min(1),
    integrationId: uuidSchema,
    network: z
      .object({
        chainId: bscChainIdSchema,
        family: z.literal("evm"),
      })
      .strict(),
    provider: z.literal("bsc-json-rpc"),
    providerGroups: z.array(integrationProviderGroupSchema).min(1),
    schemaVersion: z.literal("1"),
    startingBlock: unsignedIntegerStringSchema,
    tenantId: uuidSchema,
    tokenContracts: z.array(evmAddressSchema),
    walletAddresses: z.array(evmAddressSchema),
  })
  .strict();
export const integrationListSchema = z
  .object({
    data: z.array(integrationSchema),
    schemaVersion: z.literal("1"),
  })
  .strict();

export const updateIntegrationRequestSchema = z
  .object({
    enabled: z.boolean().optional(),
    finalityPolicyVersion: z.string().min(1).optional(),
    providerGroups: z.array(integrationProviderGroupInputSchema).min(1).max(4).optional(),
    startingBlock: unsignedIntegerStringSchema.optional(),
    tokenContracts: z.array(evmAddressSchema).min(1).max(100).optional(),
    walletAddresses: z.array(evmAddressSchema).min(1).max(100).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const dataConnectionProviderSchema = z.enum([
  "quickbooks",
  "fireblocks",
  "network_scanner",
  "company_wallet",
]);
const dataConnectionPublicConfigurationSchema = z
  .record(z.string().min(1).max(60), z.string().trim().max(1000))
  .refine((value) => Object.keys(value).length <= 20, "Too many connection settings");
export const configureDataConnectionRequestSchema = z
  .object({
    customerId: uuidSchema.optional(),
    displayName: z.string().trim().min(2).max(120),
    provider: dataConnectionProviderSchema,
    publicConfiguration: dataConnectionPublicConfigurationSchema,
    schemaVersion: z.literal("1"),
    secretReference: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u),
  })
  .strict();
export const dataConnectionSchema = z
  .object({
    connectionId: uuidSchema,
    createdAt: utcInstantSchema,
    customerId: uuidSchema.optional(),
    displayName: z.string().min(2).max(120),
    hasSecretReference: z.boolean(),
    provider: dataConnectionProviderSchema,
    publicConfiguration: dataConnectionPublicConfigurationSchema,
    schemaVersion: z.literal("1"),
    status: z.enum(["configured", "disabled"]),
    tenantId: uuidSchema,
  })
  .strict();
export const dataConnectionListSchema = z
  .object({ data: z.array(dataConnectionSchema), schemaVersion: z.literal("1") })
  .strict();

export const csvImportRequestSchema = z
  .object({
    contentBase64: z.string().min(4).max(150_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/u),
    customerId: uuidSchema.optional(),
    fileName: z
      .string()
      .trim()
      .regex(/^[^\\/]{1,180}\.csv$/iu)
      .refine((value) => !value.includes("\0"), "CSV file names cannot contain null bytes"),
    schemaVersion: z.literal("1"),
  })
  .strict();
export const csvImportSchema = z
  .object({
    byteLength: unsignedIntegerStringSchema,
    createdAt: utcInstantSchema,
    customerId: uuidSchema.optional(),
    fileName: z.string().min(1).max(180),
    importId: uuidSchema,
    objectUri: z.string().min(1),
    rowCount: unsignedIntegerStringSchema,
    schemaVersion: z.literal("1"),
    sha256: sha256Schema,
    status: z.literal("preserved"),
    tenantId: uuidSchema,
  })
  .strict();
export const csvImportListSchema = z
  .object({ data: z.array(csvImportSchema), schemaVersion: z.literal("1") })
  .strict();

export const auditEventSchema = z
  .object({
    action: authorizationValueSchema,
    actorId: uuidSchema,
    auditEventId: uuidSchema,
    occurredAt: utcInstantSchema,
    resourceId: uuidSchema,
    resourceType: z.string().min(1),
    schemaVersion: z.literal("1"),
    tenantId: uuidSchema,
  })
  .strict();

export const ingestionRunStateSchema = z.enum([
  "queued",
  "running",
  "paused",
  "stopped",
  "completed",
  "failed",
]);
export const ingestionRunSchema = z
  .object({
    checkpointBlock: unsignedIntegerStringSchema.optional(),
    completedAt: utcInstantSchema.optional(),
    endBlock: unsignedIntegerStringSchema,
    failureCode: authorizationValueSchema.optional(),
    integrationId: uuidSchema,
    movementCount: unsignedIntegerStringSchema,
    quarantineCount: unsignedIntegerStringSchema,
    runId: uuidSchema,
    schemaVersion: z.literal("1"),
    startedAt: utcInstantSchema,
    startBlock: unsignedIntegerStringSchema,
    state: ingestionRunStateSchema,
    tenantId: uuidSchema,
  })
  .strict();

export const createIngestionRunRequestSchema = z
  .object({
    endBlock: unsignedIntegerStringSchema,
    schemaVersion: z.literal("1"),
  })
  .strict();

export const ingestionRunListSchema = z
  .object({
    data: z.array(ingestionRunSchema),
    schemaVersion: z.literal("1"),
  })
  .strict();

export const ingestionQuarantineSchema = z
  .object({
    blockNumber: unsignedIntegerStringSchema,
    createdAt: utcInstantSchema,
    evidenceIds: z.array(uuidSchema).min(1),
    integrationId: uuidSchema,
    quarantineId: uuidSchema,
    reasonCode: authorizationValueSchema,
    runId: uuidSchema,
    schemaVersion: z.literal("1"),
    tenantId: uuidSchema,
  })
  .strict();

export const movementKindSchema = z.enum(["bep20_transfer", "native_fee"]);
export const movementObservedStateSchema = z.enum(["observed", "quarantined"]);
export const movementNormalizedStateSchema = z.enum(["normalized", "suppressed"]);
export const canonicalChainMovementSchema = z
  .object({
    asset: z
      .object({
        contractAddress: evmAddressSchema.optional(),
        decimals: z.number().int().min(0).max(255).optional(),
        metadataSource: z.string().min(1),
        network: z.string().min(1),
        symbol: z.string().min(1).optional(),
      })
      .strict(),
    blockHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/u),
    blockNumber: unsignedIntegerStringSchema,
    effectiveAt: utcInstantSchema,
    evidenceIds: z.array(uuidSchema).min(1),
    feePayerSource: z.enum(["receipt", "transaction", "protocol_default"]).optional(),
    fromAddress: evmAddressSchema,
    integrationId: uuidSchema,
    kind: movementKindSchema,
    logIndex: unsignedIntegerStringSchema.optional(),
    movementId: uuidSchema,
    network: z
      .object({ chainId: bscChainIdSchema, family: z.literal("evm") })
      .strict(),
    normalizedState: movementNormalizedStateSchema,
    observedAt: utcInstantSchema,
    observedState: movementObservedStateSchema,
    parserVersion: z.string().min(1),
    quantityAtomic: unsignedIntegerStringSchema,
    quantityDisplay: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/u).optional(),
    schemaVersion: z.literal("1"),
    tenantId: uuidSchema,
    toAddress: evmAddressSchema.optional(),
    transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/u),
  })
  .strict();

export const movementListSchema = z
  .object({
    data: z.array(canonicalChainMovementSchema),
    schemaVersion: z.literal("1"),
  })
  .strict();

export const verificationFinalityModeSchema = z.enum([
  "confirmations",
  "safe_tag",
  "finalized_tag",
]);
export const verificationPolicySchema = z
  .object({
    createdAt: utcInstantSchema,
    finalityMode: verificationFinalityModeSchema,
    minimumConfirmations: z.number().int().min(1).optional(),
    minimumIndependentProviders: z.number().int().min(2).max(4),
    policyId: uuidSchema,
    requireExecution: z.boolean(),
    requireInclusion: z.boolean(),
    schemaVersion: z.literal("1"),
    tenantId: uuidSchema,
    version: z.string().min(1),
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.finalityMode === "confirmations" && policy.minimumConfirmations === undefined) {
      context.addIssue({
        code: "custom",
        message: "Confirmation-based policies require minimumConfirmations",
        path: ["minimumConfirmations"],
      });
    }
    if (policy.finalityMode !== "confirmations" && policy.minimumConfirmations !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Tag-based policies must not set minimumConfirmations",
        path: ["minimumConfirmations"],
      });
    }
  });

export const verificationProviderObservationSchema = z
  .object({
    agreementKey: z.string().min(1).optional(),
    confirmationCount: unsignedIntegerStringSchema.optional(),
    evidenceIds: z.array(uuidSchema),
    execution: executionStateSchema,
    finality: finalityStateSchema,
    finalityTag: z.enum(["safe", "finalized"]).optional(),
    inclusion: inclusionStateSchema,
    independenceGroup: z.string().min(1),
    observedAt: utcInstantSchema,
    provider: z.string().min(1),
    status: z.enum(["available", "unavailable"]),
  })
  .strict();

export const verificationDecisionSchema = z
  .object({
    agreement: providerAgreementStateSchema,
    decisionId: uuidSchema,
    decidedAt: utcInstantSchema,
    evidenceIds: z.array(uuidSchema),
    execution: executionStateSchema,
    finality: finalityStateSchema,
    inclusion: inclusionStateSchema,
    movementId: uuidSchema,
    observations: z.array(verificationProviderObservationSchema).min(1),
    policyId: uuidSchema,
    policyVersion: z.string().min(1),
    reasonCodes: z.array(authorizationValueSchema).min(1),
    schemaVersion: z.literal("1"),
    supersedesDecisionId: uuidSchema.optional(),
    tenantId: uuidSchema,
    verification: verificationStateSchema,
  })
  .strict();

export const verificationDecisionListSchema = z
  .object({ data: z.array(verificationDecisionSchema), schemaVersion: z.literal("1") })
  .strict();

export const reconciliationResultSchema = z
  .object({
    closingQuantityAtomic: atomicAmountSchema,
    cutoff: utcInstantSchema,
    differenceAtomic: atomicAmountSchema,
    reconciliationId: uuidSchema,
    schemaVersion: z.literal("1"),
    state: reconciliationStateSchema,
    tenantId: uuidSchema,
  })
  .strict();

export const positionReconciliationSchema = z
  .object({
    assetId: z.string().min(1),
    completedAt: utcInstantSchema,
    customerId: uuidSchema.optional(),
    cutoff: utcInstantSchema,
    differenceAtomic: atomicAmountSchema.optional(),
    exceptionCount: unsignedIntegerStringSchema,
    excludedMovementIds: z.array(uuidSchema),
    expectedClosingQuantityAtomic: atomicAmountSchema,
    feeQuantityAtomic: unsignedIntegerStringSchema,
    incomingQuantityAtomic: unsignedIntegerStringSchema,
    observedClosingQuantityAtomic: atomicAmountSchema.optional(),
    openingQuantityAtomic: atomicAmountSchema,
    outgoingQuantityAtomic: unsignedIntegerStringSchema,
    policyVersion: z.string().min(1),
    reconciliationId: uuidSchema,
    schemaVersion: z.literal("1"),
    state: z.enum(["matched", "mismatched", "not_observed"]),
    tenantId: uuidSchema,
    verifiedMovementIds: z.array(uuidSchema),
    walletAddress: walletAddressSchema,
  })
  .strict();

export const positionReconciliationListSchema = z
  .object({ data: z.array(positionReconciliationSchema), schemaVersion: z.literal("1") })
  .strict();

export const createPositionReconciliationRequestSchema = z
  .object({
    assetId: z.string().min(1),
    customerId: uuidSchema.optional(),
    cutoff: utcInstantSchema,
    observedClosingQuantityAtomic: atomicAmountSchema.optional(),
    openingQuantityAtomic: atomicAmountSchema,
    policyVersion: z.string().min(1),
    schemaVersion: z.literal("1"),
    walletAddress: walletAddressSchema,
  })
  .strict();

export const exceptionStateSchema = z.enum([
  "open",
  "investigating",
  "resolved",
]);
export const operationalExceptionSchema = z
  .object({
    affectedResourceId: uuidSchema,
    affectedResourceType: z.enum(["movement", "reconciliation", "integration"]),
    createdAt: utcInstantSchema,
    exceptionId: uuidSchema,
    ownerActorId: uuidSchema.optional(),
    reasonCode: authorizationValueSchema,
    resolutionReasonCode: authorizationValueSchema.optional(),
    schemaVersion: z.literal("1"),
    severity: z.enum(["warning", "error"]),
    stableKey: z.string().min(1),
    state: exceptionStateSchema,
    tenantId: uuidSchema,
    updatedAt: utcInstantSchema,
  })
  .strict();

export const operationalExceptionListSchema = z
  .object({ data: z.array(operationalExceptionSchema), schemaVersion: z.literal("1") })
  .strict();

export const updateOperationalExceptionRequestSchema = z
  .object({
    note: z.string().trim().min(1).max(4_000).optional(),
    ownerActorId: uuidSchema.nullable().optional(),
    resolutionReasonCode: authorizationValueSchema.optional(),
    state: exceptionStateSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one workflow field is required");

export const exceptionWorkflowEventSchema = z
  .object({
    action: z.literal("exception:updated"),
    actorId: uuidSchema,
    after: operationalExceptionSchema,
    before: operationalExceptionSchema,
    eventId: uuidSchema,
    exceptionId: uuidSchema,
    note: z.string().min(1).max(4_000).optional(),
    occurredAt: utcInstantSchema,
    schemaVersion: z.literal("1"),
    tenantId: uuidSchema,
  })
  .strict();

export const exceptionWorkflowEventListSchema = z
  .object({ data: z.array(exceptionWorkflowEventSchema), schemaVersion: z.literal("1") })
  .strict();

export const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().regex(/^[A-Z][A-Z0-9_]*$/u),
        message: z.string().min(1),
        requestId: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const sessionContextSchema = z
  .object({
    actor: z
      .object({
        actorId: uuidSchema,
        customerId: uuidSchema.optional(),
        customerDisplayName: z.string().optional(),
        subject: z.string().min(1),
      })
      .strict(),
    authenticatedAt: utcInstantSchema,
    expiresAt: utcInstantSchema,
    permissions: z.array(authorizationValueSchema),
    roles: z.array(z.string().min(1)),
    schemaVersion: z.literal("1"),
    tenant: z
      .object({
        displayName: z.string().min(1),
        tenantId: uuidSchema,
      })
      .strict(),
  })
  .strict();

export const signInRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(12).max(128),
  })
  .strict();

export const createdSessionSchema = z
  .object({
    expiresAt: utcInstantSchema,
    schemaVersion: z.literal("1"),
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  })
  .strict();

export const systemRoleSchema = z.enum([
  "super_admin",
  "tenant_admin",
  "admin",
  "user",
  "administrator",
  "read_only_operator",
]);

export const tenantLifecycleSchema = z.enum(["active", "suspended"]);
export const tenantSchema = z
  .object({
    createdAt: utcInstantSchema,
    displayName: z.string().min(2).max(120),
    slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u),
    status: tenantLifecycleSchema,
    tenantId: uuidSchema,
  })
  .strict();

export const customerSchema = z
  .object({
    createdAt: utcInstantSchema,
    customerId: uuidSchema,
    displayName: z.string().min(2).max(120),
    email: z.string().optional(),
    externalReference: z.string().min(1).max(120),
    initialPassword: z.string().optional(),
    status: tenantLifecycleSchema,
    tenantId: uuidSchema,
  })
  .strict();

export const tenantDomainSchema = z
  .object({
    createdAt: utcInstantSchema,
    domainId: uuidSchema,
    hostname: z.string().min(3).max(253),
    kind: z.enum(["platform_subdomain", "custom"]),
    status: z.enum(["pending_dns", "verified", "active", "failed"]),
    tenantId: uuidSchema,
    verificationToken: z.string().min(16),
  })
  .strict();

export const accessRoleSchema = z
  .object({
    createdAt: utcInstantSchema,
    description: z.string().max(500),
    managed: z.boolean(),
    name: z.string().min(2).max(80),
    permissions: z.array(authorizationValueSchema),
    roleId: uuidSchema,
    systemKey: systemRoleSchema.optional(),
    tenantId: uuidSchema,
  })
  .strict();

export const managedUserSchema = z
  .object({
    actorId: uuidSchema,
    createdAt: utcInstantSchema,
    customerId: uuidSchema.optional(),
    displayName: z.string().min(2).max(120),
    email: z.email(),
    enabled: z.boolean(),
    initialPassword: z.string().optional(),
    roles: z.array(z.string().min(1)),
    tenantId: uuidSchema,
  })
  .strict();

export const billingSubscriptionSchema = z
  .object({
    amountMinor: unsignedIntegerStringSchema,
    billingKind: z.enum(["platform_to_tenant", "tenant_to_customer"]),
    createdAt: utcInstantSchema,
    currency: z.string().regex(/^[A-Z]{3}$/u),
    customerId: uuidSchema.optional(),
    interval: z.enum(["monthly", "annual"]),
    nextBillingAt: utcInstantSchema.optional(),
    planCode: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/u),
    planName: z.string().min(2).max(120),
    status: z.enum(["trialing", "active", "past_due", "paused", "cancelled"]),
    subscriptionId: uuidSchema,
    tenantId: uuidSchema,
  })
  .strict();

export const billingInvoiceSchema = z
  .object({
    amountDueMinor: unsignedIntegerStringSchema,
    amountPaidMinor: unsignedIntegerStringSchema,
    billingKind: z.enum(["platform_to_tenant", "tenant_to_customer"]),
    createdAt: utcInstantSchema,
    currency: z.string().regex(/^[A-Z]{3}$/u),
    customerId: uuidSchema.optional(),
    dueAt: utcInstantSchema,
    invoiceId: uuidSchema,
    invoiceNumber: z.string().min(2).max(80),
    status: z.enum(["draft", "open", "paid", "void", "uncollectible"]),
    tenantId: uuidSchema,
  })
  .strict();

export const controlPlaneSnapshotSchema = z
  .object({
    customers: z.array(customerSchema),
    domains: z.array(tenantDomainSchema),
    invoices: z.array(billingInvoiceSchema),
    roles: z.array(accessRoleSchema),
    schemaVersion: z.literal("1"),
    subscriptions: z.array(billingSubscriptionSchema),
    tenants: z.array(tenantSchema),
    users: z.array(managedUserSchema),
  })
  .strict();

const optionalTargetTenantSchema = z.object({ tenantId: uuidSchema.optional() });

export const createTenantRequestSchema = z
  .object({
    displayName: z.string().trim().min(2).max(120),
    schemaVersion: z.literal("1"),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u),
  })
  .strict();

export const provisionWorkspaceRequestSchema = createTenantRequestSchema
  .extend({
    administrator: z
      .object({
        displayName: z.string().trim().min(2).max(120),
        email: z.string().trim().toLowerCase().pipe(z.email()),
        temporaryPassword: z.string().min(12).max(128),
      })
      .strict(),
  })
  .strict();

export const createCustomerRequestSchema = optionalTargetTenantSchema
  .extend({
    displayName: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
    externalReference: z.string().trim().min(1).max(120),
    schemaVersion: z.literal("1"),
    temporaryPassword: z.string().min(12).max(128).optional(),
  })
  .strict();

export const resetCustomerPasswordRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
    newPassword: z.string().min(12).max(128),
    schemaVersion: z.literal("1"),
  })
  .strict();
export type ResetCustomerPasswordRequest = z.infer<typeof resetCustomerPasswordRequestSchema>;

export const createDomainRequestSchema = optionalTargetTenantSchema
  .extend({
    hostname: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u),
    kind: z.enum(["platform_subdomain", "custom"]),
    schemaVersion: z.literal("1"),
  })
  .strict();

export const createRoleRequestSchema = optionalTargetTenantSchema
  .extend({
    description: z.string().trim().max(500),
    name: z.string().trim().min(2).max(80),
    permissions: z.array(authorizationValueSchema).min(1).max(64),
    schemaVersion: z.literal("1"),
  })
  .strict();

export const createManagedUserRequestSchema = optionalTargetTenantSchema
  .extend({
    customRoleIds: z.array(uuidSchema).max(16).default([]),
    displayName: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().pipe(z.email()),
    schemaVersion: z.literal("1"),
    systemRole: z.enum(["super_admin", "tenant_admin", "admin", "user"]),
    temporaryPassword: z.string().min(12).max(128),
  })
  .strict();

export const upsertBillingSubscriptionRequestSchema = optionalTargetTenantSchema
  .extend({
    amountMinor: unsignedIntegerStringSchema,
    billingKind: z.enum(["platform_to_tenant", "tenant_to_customer"]),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/u),
    customerId: uuidSchema.optional(),
    interval: z.enum(["monthly", "annual"]),
    nextBillingAt: utcInstantSchema.optional(),
    planCode: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/u),
    planName: z.string().trim().min(2).max(120),
    schemaVersion: z.literal("1"),
    status: z.enum(["trialing", "active", "past_due", "paused", "cancelled"]),
  })
  .strict();

export const createBillingInvoiceRequestSchema = optionalTargetTenantSchema
  .extend({
    amountDueMinor: unsignedIntegerStringSchema,
    billingKind: z.enum(["platform_to_tenant", "tenant_to_customer"]),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/u),
    customerId: uuidSchema.optional(),
    dueAt: utcInstantSchema,
    invoiceNumber: z.string().trim().min(2).max(80),
    schemaVersion: z.literal("1"),
  })
  .strict();

const evmAnchorSchema = z
  .object({
    blockHash: z.string().min(1),
    blockNumber: unsignedIntegerStringSchema,
    chainId: unsignedIntegerStringSchema,
    family: z.literal("evm"),
    transactionHash: z.string().min(1),
  })
  .strict();

const bitcoinAnchorSchema = z
  .object({
    blockHash: z.string().min(1),
    blockHeight: unsignedIntegerStringSchema,
    family: z.literal("bitcoin"),
    network: z.string().min(1),
    transactionId: z.string().min(1),
  })
  .strict();

const solanaAnchorSchema = z
  .object({
    blockhash: z.string().min(1),
    family: z.literal("solana"),
    network: z.string().min(1),
    signature: z.string().min(1),
    slot: unsignedIntegerStringSchema,
  })
  .strict();

const otherAnchorSchema = z
  .object({
    anchor: z.string().min(1),
    family: z.literal("other"),
    network: z.string().min(1),
  })
  .strict();

export const networkAnchorSchema = z.discriminatedUnion("family", [
  evmAnchorSchema,
  bitcoinAnchorSchema,
  solanaAnchorSchema,
  otherAnchorSchema,
]);

export const sourceIdentitySchema = z
  .object({
    objectId: z.string().min(1),
    objectType: z.string().min(1),
    revision: z.string().min(1).optional(),
  })
  .strict();

export const rawEvidenceReferenceSchema = z
  .object({
    byteLength: unsignedIntegerStringSchema,
    evidenceId: uuidSchema,
    objectUri: z.string().min(1),
    sha256: sha256Schema,
  })
  .strict();

export const sourceRecordSchema = z
  .object({
    effectiveAt: utcInstantSchema.optional(),
    external: sourceIdentitySchema,
    independenceGroup: z.string().min(1),
    integrationId: uuidSchema,
    networkAnchor: networkAnchorSchema.optional(),
    observedAt: utcInstantSchema,
    payloadFormat: z.enum(["json", "csv", "webhook", "rpc", "binary", "other"]),
    provider: z.string().min(1),
    rawEvidence: rawEvidenceReferenceSchema,
    schemaVersion: z.literal("1"),
    sourceLifecycle: sourceLifecycleSchema,
    sourceRecordId: uuidSchema,
    tenantId: uuidSchema,
  })
  .strict();

export const assetIdentitySchema = z
  .object({
    assetId: z.string().min(1),
    decimals: z.number().int().min(0).max(255),
    network: z.string().min(1),
    symbol: z.string().min(1).optional(),
    tokenId: z.string().min(1).optional(),
  })
  .strict();

export const canonicalMovementSchema = z
  .object({
    asset: assetIdentitySchema,
    effectiveAt: utcInstantSchema,
    movementDiscriminator: z.string().min(1),
    movementId: uuidSchema,
    quantityAtomic: atomicAmountSchema,
    sourceRecordIds: z.array(uuidSchema).min(1),
    tenantId: uuidSchema,
  })
  .strict();

export type SourceRecord = z.infer<typeof sourceRecordSchema>;
export type CanonicalMovement = z.infer<typeof canonicalMovementSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type SessionContext = z.infer<typeof sessionContextSchema>;
export type SignInRequest = z.infer<typeof signInRequestSchema>;
export type CreatedSession = z.infer<typeof createdSessionSchema>;
export type SystemRole = z.infer<typeof systemRoleSchema>;
export type Tenant = z.infer<typeof tenantSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type TenantDomain = z.infer<typeof tenantDomainSchema>;
export type AccessRole = z.infer<typeof accessRoleSchema>;
export type ManagedUser = z.infer<typeof managedUserSchema>;
export type BillingSubscription = z.infer<typeof billingSubscriptionSchema>;
export type BillingInvoice = z.infer<typeof billingInvoiceSchema>;
export type ControlPlaneSnapshot = z.infer<typeof controlPlaneSnapshotSchema>;
export type CreateTenantRequest = z.infer<typeof createTenantRequestSchema>;
export type ProvisionWorkspaceRequest = z.infer<typeof provisionWorkspaceRequestSchema>;
export type CreateCustomerRequest = z.infer<typeof createCustomerRequestSchema>;
export type CreateDomainRequest = z.infer<typeof createDomainRequestSchema>;
export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;
export type CreateManagedUserRequest = z.infer<typeof createManagedUserRequestSchema>;
export type UpsertBillingSubscriptionRequest = z.infer<typeof upsertBillingSubscriptionRequestSchema>;
export type CreateBillingInvoiceRequest = z.infer<typeof createBillingInvoiceRequestSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type CreateIntegrationRequest = z.infer<
  typeof createIntegrationRequestSchema
>;
export type Integration = z.infer<typeof integrationSchema>;
export type UpdateIntegrationRequest = z.infer<
  typeof updateIntegrationRequestSchema
>;
export type ConfigureDataConnectionRequest = z.infer<typeof configureDataConnectionRequestSchema>;
export type DataConnection = z.infer<typeof dataConnectionSchema>;
export type CsvImport = z.infer<typeof csvImportSchema>;
export type CsvImportRequest = z.infer<typeof csvImportRequestSchema>;
export type IngestionRun = z.infer<typeof ingestionRunSchema>;
export type CreateIngestionRunRequest = z.infer<
  typeof createIngestionRunRequestSchema
>;
export type IngestionQuarantine = z.infer<typeof ingestionQuarantineSchema>;
export type CanonicalChainMovement = z.infer<
  typeof canonicalChainMovementSchema
>;
export type VerificationPolicy = z.infer<typeof verificationPolicySchema>;
export type VerificationProviderObservation = z.infer<
  typeof verificationProviderObservationSchema
>;
export type VerificationDecision = z.infer<typeof verificationDecisionSchema>;
export type PositionReconciliation = z.infer<typeof positionReconciliationSchema>;
export type CreatePositionReconciliationRequest = z.infer<
  typeof createPositionReconciliationRequestSchema
>;
export type OperationalException = z.infer<typeof operationalExceptionSchema>;
export type UpdateOperationalExceptionRequest = z.infer<
  typeof updateOperationalExceptionRequestSchema
>;
export type ExceptionWorkflowEvent = z.infer<typeof exceptionWorkflowEventSchema>;

export const fireblocksWalletSchema = z
  .object({
    asAt: utcInstantSchema,
    assetId: z.string().min(1),
    availableBalance: z.string(),
    customerId: uuidSchema.optional(),
    pendingBalance: z.string(),
    schemaVersion: z.literal("1"),
    totalBalance: z.string(),
    vaultAccountId: z.string().min(1),
    vaultAccountName: z.string().min(1),
    walletAddress: z.string().min(1),
  })
  .strict();
export const fireblocksWalletListSchema = z
  .object({ data: z.array(fireblocksWalletSchema), schemaVersion: z.literal("1") })
  .strict();
export type FireblocksWallet = z.infer<typeof fireblocksWalletSchema>;

export const reconcileFireblocksWalletRequestSchema = z
  .object({
    assetId: z.string().min(1),
    customerId: uuidSchema.optional(),
    cutoff: utcInstantSchema.optional(),
    openingQuantityAtomic: atomicAmountSchema.default("0"),
    policyVersion: z.string().min(1).default("bsc-v1"),
    schemaVersion: z.literal("1"),
    walletAddress: z.string().min(1),
  })
  .strict();
export type ReconcileFireblocksWalletRequest = z.infer<typeof reconcileFireblocksWalletRequestSchema>;

export const reconcileCsvRequestSchema = z
  .object({
    customerId: uuidSchema.optional(),
    importId: uuidSchema.optional(),
    policyVersion: z.string().min(1).default("bsc-v1"),
    schemaVersion: z.literal("1").default("1"),
  })
  .strict();
export type ReconcileCsvRequest = z.infer<typeof reconcileCsvRequestSchema>;

export const networkScannerTestRequestSchema = z
  .object({
    apiKey: z.string().trim().max(200).optional(),
    apiUrl: z.string().trim().min(5).max(500),
    networkId: z.string().trim().min(1).max(60),
    schemaVersion: z.literal("1").default("1"),
  })
  .strict();
export type NetworkScannerTestRequest = z.infer<typeof networkScannerTestRequestSchema>;

export const companyWalletSchema = z
  .object({
    address: z.string().min(1),
    customerId: uuidSchema.optional(),
    label: z.string().min(1).max(100),
    network: z.string().min(1).max(50),
    schemaVersion: z.literal("1").default("1"),
    walletId: uuidSchema,
  })
  .strict();
export type CompanyWallet = z.infer<typeof companyWalletSchema>;

export const networkScannerInfoSchema = z
  .object({
    category: z.enum(["EVM", "UTXO", "SVM", "TVM"]),
    chainId: z.string().optional(),
    defaultApiUrl: z.string().min(1),
    docsUrl: z.string().min(1),
    explorerUrl: z.string().min(1),
    id: z.string().min(1),
    name: z.string().min(1),
    nativeAsset: z.string().min(1),
  })
  .strict();
export const networkScannerInfoListSchema = z
  .object({ data: z.array(networkScannerInfoSchema), schemaVersion: z.literal("1") })
  .strict();
export type NetworkScannerInfo = z.infer<typeof networkScannerInfoSchema>;

