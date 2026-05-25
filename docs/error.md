GET /podopieczny/sylwetka.data 200 - - 17.226 ms
syscall: 'mkdir',
path: '/data/body'
}
POST /podopieczny/sylwetka.data 500 - - 191.164 ms
Error: EACCES: permission denied, mkdir '/data/body'
GET /podopieczny/sylwetka 200 - - 23.375 ms
GET /**manifest?paths=%2Fpodopieczny%2C%2Fpodopieczny%2Fhistoria%2C%2Fpodopieczny%2Fsesje%2C%2Fpodopieczny%2Fstatystyki%2C%2Fpodopieczny%2Fsylwetka&version=340f4ba1 200 - - 2.552 ms
at mkdir (node:internal/fs/promises:858:10)
at LocalVolumeStorage.write (file:///app/build/server/index.js:1552:5)
at uploadFile (file:///app/build/server/index.js:3818:18)
at addBodyPhoto (file:///app/build/server/index.js:8613:22)
at action (file:///app/build/server/index.js:14288:5)
at callRouteHandler (file:///app/node_modules/react-router/dist/development/chunk-RJYABSBD.mjs:533:16)
at file:///app/node_modules/react-router/dist/development/chunk-4N6VE7H7.mjs:5045:19
at callLoaderOrAction (file:///app/node_modules/react-router/dist/development/chunk-4N6VE7H7.mjs:5097:16)
at async Promise.all (index 0)
at defaultDataStrategy (file:///app/node_modules/react-router/dist/development/chunk-4N6VE7H7.mjs:4722:17) {
errno: -13,
code: 'EACCES',
Error: EACCES: permission denied, mkdir '/data/body'
at mkdir (node:internal/fs/promises:858:10)
at async Promise.all (index 0)
at LocalVolumeStorage.write (file:///app/build/server/index.js:1552:5)
at uploadFile (file:///app/build/server/index.js:3818:18)
at defaultDataStrategy (file:///app/node_modules/react-router/dist/development/chunk-4N6VE7H7.mjs:4722:17) {
at addBodyPhoto (file:///app/build/server/index.js:8613:22)
errno: -13,
at action (file:///app/build/server/index.js:14288:5)
code: 'EACCES',
syscall: 'mkdir',
path: '/data/body'
at callRouteHandler (file:///app/node_modules/react-router/dist/development/chunk-RJYABSBD.mjs:533:16)
}
at file:///app/node_modules/react-router/dist/development/chunk-4N6VE7H7.mjs:5045:19
POST /podopieczny/sylwetka.data 500 - - 91.219 ms
at callLoaderOrAction (file:///app/node_modules/react-router/dist/development/chunk-4N6VE7H7.mjs:5097:16)
GET /podopieczny/sylwetka 200 - - 45.131 ms
GET /podopieczny/historia.data 200 - - 16.529 ms
GET /**manifest?paths=%2Fpodopieczny%2Fhistoria%2F1a806d1a-606f-488b-b2da-039e4ea81022&version=340f4ba1 200 - - 2.601 ms
GET /podopieczny/historia/1a806d1a-606f-488b-b2da-039e4ea81022.data 200 - - 14.396 ms
GET /podopieczny.data 200 - - 31.676 ms
GET /\_\_manifest?paths=%2Fpodopieczny%2Floguj%2F371cfdd2-d1d3-4a3e-9cee-8ef59b8f2772%2C%2Fpodopieczny%2Fsesje%2F371cfdd2-d1d3-4a3e-9cee-8ef59b8f2772&version=340f4ba1 200 - - 2.359 ms
address: 'fd12:e032:30ed:1:4000:129:928e:c4cf',
Error: connect ECONNREFUSED fd12:e032:30ed:1:4000:129:928e:c4cf:5432
port: 5432
at createConnectionError (node:net:1678:14)
Error: connect ETIMEDOUT 10.142.196.207:5432
}
at afterConnectMultiple (node:net:1708:16) {
at createConnectionError (node:net:1678:14)
]
errno: -111,
syscall: 'connect',
}
at Timeout.internalConnectMultipleTimeout (node:net:1737:38)
code: 'ECONNREFUSED',
address: '10.142.196.207',
at listOnTimeout (node:internal/timers:587:11)
syscall: 'connect',
at processTimers (node:internal/timers:521:7) {
errno: -110,
port: 5432
code: 'ETIMEDOUT',
},
AggregateError:
at internalConnectMultiple (node:net:1134:18)
at afterConnectMultiple (node:net:1715:7) {
code: 'ETIMEDOUT',
[errors]: [
code: 'ETIMEDOUT',
syscall: 'connect',
address: '10.142.196.207',
port: 5432
},
Error: connect ECONNREFUSED fd12:e032:30ed:1:4000:129:928e:c4cf:5432
at createConnectionError (node:net:1678:14)
AggregateError:
at internalConnectMultiple (node:net:1134:18)
at afterConnectMultiple (node:net:1708:16) {
at afterConnectMultiple (node:net:1715:7) {
errno: -111,
code: 'ETIMEDOUT',
[errors]: [
code: 'ECONNREFUSED',
Error: connect ETIMEDOUT 10.142.196.207:5432
at createConnectionError (node:net:1678:14)
syscall: 'connect',
at Timeout.internalConnectMultipleTimeout (node:net:1737:38)
at listOnTimeout (node:internal/timers:587:11)
address: 'fd12:e032:30ed:1:4000:129:928e:c4cf',
at processTimers (node:internal/timers:521:7) {
port: 5432
errno: -110,
}
]
