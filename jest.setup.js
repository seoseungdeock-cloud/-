jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// 움직임(reanimated): 테스트에서는 웹 구현을 쓰도록 package.json 의 jest.resolver(react-native-worklets)와 함께 설정합니다
require('react-native-reanimated').setUpTests();
