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

sql 文件其实是一个 js/ts 文件,导出返回 sql 的函数：

```
export const select_list = (param: {[key:string]:any}) => {
  return `SELECT * FROM name`;
};
```

注意：

1. 所有的方法在接受查询参数时，都是以 `key-value`(`param: {[key:string]:any}`) 的形势接受的。
2. 当使用 `PageQuery` 进行查询时，会多传一个参数：当前查询**是否是记录数查询**，即 `true|false`, true 表示本次查询只查询记录数，而不是实际的数据
3. 第二个参数是可选的，如果你的 sql 不会用作 `PageQuery` 查询，那么就可以忽略这个参数了
4. 参数方式 `WHERE NAME = :param` 声明了一个参数名为 `param`, 这个参数将在最终 sql 执行时 由引擎赋值，可防止 sql 注入
5. 参数方式 `WHERE NAME = '+param.name+'` 直接取方法的参数进行 sql 语句拼接，
