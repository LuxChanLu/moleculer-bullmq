# moleculer-bullmq

[![Coverage Status](https://coveralls.io/repos/github/Hugome/moleculer-bullmq/badge.svg?branch=master)](https://coveralls.io/github/Hugome/moleculer-bullmq?branch=master)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/24c78365441a4e5e99dde311cfa72f18)](https://www.codacy.com/app/Hugome/moleculer-bullmq?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=Hugome/moleculer-bullmq&amp;utm_campaign=Badge_Grade)
[![Maintainability](https://api.codeclimate.com/v1/badges/e7d4fa4fbe1032b51c77/maintainability)](https://codeclimate.com/github/Hugome/moleculer-bullmq/maintainability)
[![David](https://img.shields.io/david/Hugome/moleculer-bullmq.svg)](https://david-dm.org/Hugome/moleculer-bullmq)
[![Downloads](https://img.shields.io/npm/dm/moleculer-bullmq.svg)](https://www.npmjs.com/package/moleculer-bullmq)

## How to create job
You just need to add the `BullMqMixin` and add a `queue` attribute to you action.
This action will be call with the params & meta of the scheduler.
The return of the action will be the job result
The mixin will add this BullMq `job` into `locals`
```js
module.exports = {
    name: 'jobs',
    mixins: [BullMqMixin],
    settings: {
      bullmq: {
        worker: { concurrency: 50 }
      }
    },
    actions: {
      resize: {
        queue: true,
        params: { width: 'number', height: 'number' },
        async handler(ctx) {
          const { width, height } = ctx.params
          const { user } = ctx.meta
          ctx.locals.job.updateProgress(100)
          return { user, size: width * height, job: ctx.locals.job.id }
        }
      }
    }
  }
```
## How to queue job
You can use the `queue` method, with four parameters : Queue name, Action name, Parameters, Job options
```js
module.exports = {
    name: 'my.service',
    mixins: [BullMqMixin],
    actions: {
      'resize.async': {
        async handler(ctx) {
          ctx.meta.user = 'Bob de glace'
          const job = await this.queue('jobs', 'resize', { width: 42, height: 42 }, { priority: 10 })
        }
      }
    }
  }
```
If your in the same service as your scheduling action, you can omit the queue name with the `localQueue` method
```js
module.exports = {
    name: 'my.service',
    mixins: [BullMqMixin],
    actions: {
      resize: {
        queue: true,
        params: { width: 'number', height: 'number' },
        async handler(ctx) {
          const { width, height } = ctx.params
          const { user } = ctx.meta
          ctx.locals.job.updateProgress(100)
          return { user, size: width * height, job: ctx.locals.job.id }
        }
      },
      'resize.async': {
        async handler(ctx) {
          ctx.meta.user = 'Bob de glace'
          const job = await this.localQueue('resize', { width: 42, height: 42 }, { priority: 10 })
        }
      }
    }
  }
```

