// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import type { JSONSchemaType } from 'ajv';

import { type JsonType, OCPPVersion } from '../../../types';
import { OCPPServiceUtils } from '../OCPPServiceUtils';

export class OCPP20ServiceUtils extends OCPPServiceUtils {
  public static parseJsonSchemaFile<T extends JsonType>(
    relativePath: string,
    moduleName?: string,
    methodName?: string
  ): JSONSchemaType<T> {
    return super.parseJsonSchemaFile<T>(
      relativePath,
      OCPPVersion.VERSION_20,
      moduleName,
      methodName
    );
  }
}
