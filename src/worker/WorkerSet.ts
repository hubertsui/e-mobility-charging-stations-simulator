// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import EventEmitterAsyncResource from 'node:events';
import { SHARE_ENV, Worker } from 'node:worker_threads';

import { WorkerAbstract } from './WorkerAbstract';
import { WorkerConstants } from './WorkerConstants';
import {
  type SetInfo,
  type WorkerData,
  WorkerMessageEvents,
  type WorkerOptions,
  type WorkerSetElement,
  WorkerSetEvents,
} from './WorkerTypes';
import { sleep } from './WorkerUtils';

export class WorkerSet extends WorkerAbstract<WorkerData> {
  public readonly emitter: EventEmitterAsyncResource;
  private readonly workerSet: Set<WorkerSetElement>;

  /**
   * Create a new `WorkerSet`.
   *
   * @param workerScript -
   * @param workerOptions -
   */
  constructor(workerScript: string, workerOptions?: WorkerOptions) {
    super(workerScript, workerOptions);
    this.workerOptions.poolOptions = {
      ...{
        enableEvents: true,
        restartWorkerOnError: true,
      },
      ...this.workerOptions.poolOptions,
    };
    this.workerSet = new Set<WorkerSetElement>();
    if (this.workerOptions?.poolOptions?.enableEvents) {
      this.emitter = new EventEmitterAsyncResource();
    }
  }

  get info(): SetInfo {
    return {
      type: 'set',
      worker: 'thread',
      size: this.size,
      elementsExecuting: [...this.workerSet].reduce(
        (accumulator, workerSetElement) => accumulator + workerSetElement.numberOfWorkerElements,
        0
      ),
      elementsPerWorker: this.maxElementsPerWorker,
    };
  }

  get size(): number {
    return this.workerSet.size;
  }

  get maxElementsPerWorker(): number | undefined {
    return this.workerOptions.elementsPerWorker;
  }

  /** @inheritDoc */
  public async start(): Promise<void> {
    this.addWorkerSetElement();
    // Add worker set element sequentially to optimize memory at startup
    this.workerOptions.workerStartDelay > 0 && (await sleep(this.workerOptions.workerStartDelay));
  }

  /** @inheritDoc */
  public async stop(): Promise<void> {
    for (const workerSetElement of this.workerSet) {
      await workerSetElement.worker.terminate();
    }
    this.workerSet.clear();
  }

  /** @inheritDoc */
  public async addElement(elementData: WorkerData): Promise<void> {
    if (!this.workerSet) {
      throw new Error("Cannot add a WorkerSet element: workers' set does not exist");
    }
    const workerSetElement = await this.getWorkerSetElement();
    workerSetElement.worker.postMessage({
      id: WorkerMessageEvents.startWorkerElement,
      data: elementData,
    });
    ++workerSetElement.numberOfWorkerElements;
    // Add element sequentially to optimize memory at startup
    if (this.workerOptions.elementStartDelay > 0) {
      await sleep(this.workerOptions.elementStartDelay);
    }
  }

  /**
   * Add a new `WorkerSetElement`.
   */
  private addWorkerSetElement(): WorkerSetElement {
    const worker = new Worker(this.workerScript, {
      env: SHARE_ENV,
      ...this.workerOptions.poolOptions.workerOptions,
    });
    worker.on(
      'message',
      this.workerOptions?.poolOptions?.messageHandler ?? WorkerConstants.EMPTY_FUNCTION
    );
    worker.on(
      'error',
      this.workerOptions?.poolOptions?.errorHandler ?? WorkerConstants.EMPTY_FUNCTION
    );
    worker.on('error', (error) => {
      if (this.emitter !== undefined) {
        this.emitter.emit(WorkerSetEvents.error, error);
      }
      if (this.workerOptions?.poolOptions?.restartWorkerOnError) {
        this.addWorkerSetElement();
      }
    });
    worker.on(
      'online',
      this.workerOptions?.poolOptions?.onlineHandler ?? WorkerConstants.EMPTY_FUNCTION
    );
    worker.on(
      'exit',
      this.workerOptions?.poolOptions?.exitHandler ?? WorkerConstants.EMPTY_FUNCTION
    );
    worker.once('exit', () => this.workerSet.delete(this.getWorkerSetElementByWorker(worker)));
    const workerSetElement: WorkerSetElement = { worker, numberOfWorkerElements: 0 };
    this.workerSet.add(workerSetElement);
    return workerSetElement;
  }

  private async getWorkerSetElement(): Promise<WorkerSetElement> {
    let chosenWorkerSetElement: WorkerSetElement;
    for (const workerSetElement of this.workerSet) {
      if (workerSetElement.numberOfWorkerElements < this.workerOptions.elementsPerWorker) {
        chosenWorkerSetElement = workerSetElement;
        break;
      }
    }
    if (!chosenWorkerSetElement) {
      chosenWorkerSetElement = this.addWorkerSetElement();
      // Add worker set element sequentially to optimize memory at startup
      this.workerOptions.workerStartDelay > 0 && (await sleep(this.workerOptions.workerStartDelay));
    }
    return chosenWorkerSetElement;
  }

  private getWorkerSetElementByWorker(worker: Worker): WorkerSetElement | undefined {
    let workerSetElt: WorkerSetElement;
    for (const workerSetElement of this.workerSet) {
      if (workerSetElement.worker.threadId === worker.threadId) {
        workerSetElt = workerSetElement;
        break;
      }
    }
    return workerSetElt;
  }
}
