# Generate ORM SQL for common databases

## 配置

在项目`根目录`建立文件`.sqlman.js`

```
module.exports = {
  // sql文件的路径
  sqlDir: 'app/sql',
  // 批量处理时，每次提交的条数,默认500
  maxDeal: 500
};
```
