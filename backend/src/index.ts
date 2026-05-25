import { app } from '@azure/functions';

app.setup({
  enableHttpStream: false,
});

export * from './functions/health';
export * from './functions/generateImage';
export * from './functions/analyzePage';
export * from './functions/distillScope';
