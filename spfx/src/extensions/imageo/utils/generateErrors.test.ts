jest.mock('ImageoApplicationCustomizerStrings', () => ({ ToastOutputBlocked: 'Generated image blocked' }), { virtual: true });

import { BackendError } from '../models/IContracts';
import { describeGenerateError, getImageServiceResponse } from './generateErrors';

describe('image editor errors', () => {
  it('keeps the output filter details when the editor catches a BackendError', () => {
    const serviceResponse = {
      httpStatus: 400,
      providerCode: 'content_safety_violation',
      stage: 'output',
      category: 'disallowed',
      requestId: '0123456789abcdef0123456789abcdef',
    };
    const error: unknown = new BackendError('Foundry blocked the generated image. No image was returned.',
      400, 'output_content_filtered', { serviceResponse });

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof BackendError)) throw error;
    const details = getImageServiceResponse(error);
    expect(details).toEqual(serviceResponse);
    expect(describeGenerateError(error, details)).toMatchObject({ title: 'Generated image blocked', kind: 'content_safety' });
  });
});
