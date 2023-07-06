import type EventEmitterAsyncResource from 'node:events';
import fs from 'node:fs';
import type { Worker } from 'node:worker_threads';

import type { ErrorHandler, ExitHandler, PoolInfo } from 'poolifier';

import { WorkerConstants } from './WorkerConstants';
import type { SetInfo, WorkerData, WorkerOptions } from './WorkerTypes';
import { defaultErrorHandler, defaultExitHandler } from './WorkerUtils';

export abstract class WorkerAbstract<T extends WorkerData> {
  protected readonly workerScript: string;
  protected readonly workerOptions: WorkerOptions;
  public abstract readonly info: PoolInfo | SetInfo;
  public abstract readonly size: number;
  public abstract readonly maxElementsPerWorker: number | undefined;
  public abstract readonly emitter: EventEmitterAsyncResource | undefined;

  /**
   * `WorkerAbstract` constructor.
   *
   * @param workerScript -
   * @param workerOptions -
   */
  constructor(
    workerScript: string,
    workerOptions: WorkerOptions = {
      workerStartDelay: WorkerConstants.DEFAULT_WORKER_START_DELAY,
      elementStartDelay: WorkerConstants.DEFAULT_ELEMENT_START_DELAY,
      poolMinSize: WorkerConstants.DEFAULT_POOL_MIN_SIZE,
      poolMaxSize: WorkerConstants.DEFAULT_POOL_MAX_SIZE,
      elementsPerWorker: WorkerConstants.DEFAULT_ELEMENTS_PER_WORKER,
      poolOptions: {},
    }
  ) {
    if (workerScript === null || workerScript === undefined) {
      throw new Error('Worker script is not defined');
    }
    if (typeof workerScript === 'string' && workerScript.trim().length === 0) {
      throw new Error('Worker script is empty');
    }
    if (!fs.existsSync(workerScript)) {
      throw new Error('Worker script file does not exist');
    }
    this.workerScript = workerScript;
    this.workerOptions = workerOptions;
    this.workerOptions.poolOptions?.messageHandler?.bind(this);
    this.workerOptions.poolOptions.errorHandler = (
      this.workerOptions?.poolOptions?.errorHandler ?? defaultErrorHandler
    ).bind(this) as ErrorHandler<Worker>;
    this.workerOptions.poolOptions?.onlineHandler?.bind(this);
    this.workerOptions.poolOptions.exitHandler = (
      this.workerOptions?.poolOptions?.exitHandler ?? defaultExitHandler
    ).bind(this) as ExitHandler<Worker>;
  }

  /**
   * Start the worker pool/set.
   */
  public abstract start(): Promise<void>;
  /**
   * Stop the worker pool/set.
   */
  public abstract stop(): Promise<void>;
  /**
   * Add a task element to the worker pool/set.
   *
   * @param elementData -
   */
  public abstract addElement(elementData: T): Promise<void>;
}
