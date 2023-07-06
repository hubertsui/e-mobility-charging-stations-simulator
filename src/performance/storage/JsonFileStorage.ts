// Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import fs from 'node:fs';
import path from 'node:path';

import { Storage } from './Storage';
import { BaseError } from '../../exception';
import { FileType, type Statistics } from '../../types';
import { AsyncLock, AsyncLockType, Constants, Utils, handleFileException } from '../../utils';

export class JsonFileStorage extends Storage {
  private fd: number | null = null;

  constructor(storageUri: string, logPrefix: string) {
    super(storageUri, logPrefix);
    this.dbName = this.storageUri.pathname;
  }

  public storePerformanceStatistics(performanceStatistics: Statistics): void {
    this.checkPerformanceRecordsFile();
    AsyncLock.acquire(AsyncLockType.performance)
      .then(() => {
        const fileData = fs.readFileSync(this.dbName, 'utf8');
        const performanceRecords: Statistics[] = fileData
          ? (JSON.parse(fileData) as Statistics[])
          : [];
        performanceRecords.push(performanceStatistics);
        fs.writeFileSync(
          this.dbName,
          Utils.JSONStringifyWithMapSupport(performanceRecords, 2),
          'utf8'
        );
      })
      .catch((error) => {
        handleFileException(
          this.dbName,
          FileType.PerformanceRecords,
          error as NodeJS.ErrnoException,
          this.logPrefix
        );
      })
      .finally(() => {
        AsyncLock.release(AsyncLockType.performance).catch(Constants.EMPTY_FUNCTION);
      });
  }

  public open(): void {
    try {
      if (Utils.isNullOrUndefined(this?.fd)) {
        if (!fs.existsSync(path.dirname(this.dbName))) {
          fs.mkdirSync(path.dirname(this.dbName), { recursive: true });
        }
        this.fd = fs.openSync(this.dbName, 'a+');
      }
    } catch (error) {
      handleFileException(
        this.dbName,
        FileType.PerformanceRecords,
        error as NodeJS.ErrnoException,
        this.logPrefix
      );
    }
  }

  public close(): void {
    try {
      if (this?.fd) {
        fs.closeSync(this.fd);
        this.fd = null;
      }
    } catch (error) {
      handleFileException(
        this.dbName,
        FileType.PerformanceRecords,
        error as NodeJS.ErrnoException,
        this.logPrefix
      );
    }
  }

  private checkPerformanceRecordsFile(): void {
    if (!this?.fd) {
      throw new BaseError(
        `${this.logPrefix} Performance records '${this.dbName}' file descriptor not found`
      );
    }
  }
}
