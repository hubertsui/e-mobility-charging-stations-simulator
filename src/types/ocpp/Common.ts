import type { JsonObject } from '../JsonType';

export enum GenericStatus {
  Accepted = 'Accepted',
  Rejected = 'Rejected',
}

export interface GenericResponse extends JsonObject {
  status: GenericStatus;
}

export enum RegistrationStatusEnumType {
  ACCEPTED = 'Accepted',
  PENDING = 'Pending',
  REJECTED = 'Rejected',
}
