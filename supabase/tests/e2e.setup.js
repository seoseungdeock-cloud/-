// 시험 환경(react-native)이 fetch를 가짜로 바꿔 두므로, 끝까지 시험에서는 실제 네트워크 fetch를 씁니다.
const nodeFetch = require('node-fetch');
global.fetch = nodeFetch;
global.Headers = nodeFetch.Headers;
global.Request = nodeFetch.Request;
global.Response = nodeFetch.Response;
