// app.json을 그대로 쓰되, 웹 주소가 하위 경로일 때(예: GitHub Pages의 /-/) EXPO_BASE_URL로 넘깁니다.
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}) },
});
