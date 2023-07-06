import type { JsonObject } from '../../JsonType';
import type { GenericStatus } from '../Responses';

export enum DataEnumType {
  // eslint-disable-next-line id-blacklist
  string = 'string',
  decimal = 'decimal',
  integer = 'integer',
  dateTime = 'dateTime',
  // eslint-disable-next-line id-blacklist
  boolean = 'boolean',
  OptionList = 'OptionList',
  SequenceList = 'SequenceList',
  MemberList = 'MemberList',
}

export enum BootReasonEnumType {
  ApplicationReset = 'ApplicationReset',
  FirmwareUpdate = 'FirmwareUpdate',
  LocalReset = 'LocalReset',
  PowerUp = 'PowerUp',
  RemoteReset = 'RemoteReset',
  ScheduledReset = 'ScheduledReset',
  Triggered = 'Triggered',
  Unknown = 'Unknown',
  Watchdog = 'Watchdog',
}

export enum OperationalStatusEnumType {
  Operative = 'Operative',
  Inoperative = 'Inoperative',
}

export enum OCPP20ConnectorStatusEnumType {
  Available = 'Available',
  Occupied = 'Occupied',
  Reserved = 'Reserved',
  Unavailable = 'Unavailable',
  Faulted = 'Faulted',
}

export type GenericStatusEnumType = GenericStatus;

export enum HashAlgorithmEnumType {
  SHA256 = 'SHA256',
  SHA384 = 'SHA384',
  SHA512 = 'SHA512',
}

export enum GetCertificateIdUseEnumType {
  V2GRootCertificate = 'V2GRootCertificate',
  MORootCertificate = 'MORootCertificate',
  CSMSRootCertificate = 'CSMSRootCertificate',
  V2GCertificateChain = 'V2GCertificateChain',
  ManufacturerRootCertificate = 'ManufacturerRootCertificate',
}

export enum GetCertificateStatusEnumType {
  Accepted = 'Accepted',
  Failed = 'Failed',
}

export enum GetInstalledCertificateStatusEnumType {
  Accepted = 'Accepted',
  NotFound = 'NotFound',
}

export enum InstallCertificateStatusEnumType {
  Accepted = 'Accepted',
  Rejected = 'Rejected',
  Failed = 'Failed',
}

export enum InstallCertificateUseEnumType {
  V2GRootCertificate = 'V2GRootCertificate',
  MORootCertificate = 'MORootCertificate',
  CSMSRootCertificate = 'CSMSRootCertificate',
  ManufacturerRootCertificate = 'ManufacturerRootCertificate',
}

export enum DeleteCertificateStatusEnumType {
  Accepted = 'Accepted',
  Failed = 'Failed',
  NotFound = 'NotFound',
}

export enum CertificateActionEnumType {
  Install = 'Install',
  Update = 'Update',
}

export enum CertificateSigningUseEnumType {
  ChargingStationCertificate = 'ChargingStationCertificate',
  V2GCertificate = 'V2GCertificate',
}

export type CertificateSignedStatusEnumType = GenericStatusEnumType;

export type CertificateHashDataType = {
  hashAlgorithm: HashAlgorithmEnumType;
  issuerNameHash: string;
  issuerKeyHash: string;
  serialNumber: string;
} & JsonObject;

export type CertificateHashDataChainType = {
  certificateType: GetCertificateIdUseEnumType;
  certificateHashData: CertificateHashDataType;
  childCertificateHashData?: CertificateHashDataType;
} & JsonObject;

export type OCSPRequestDataType = {
  hashAlgorithm: HashAlgorithmEnumType;
  issuerNameHash: string;
  issuerKeyHash: string;
  serialNumber: string;
  responderURL: string;
} & JsonObject;

export type StatusInfoType = {
  reasonCode: string;
  additionalInfo?: string;
} & JsonObject;

export type EVSEType = {
  id: number;
  connectorId?: string;
} & JsonObject;
