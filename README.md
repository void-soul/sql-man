# Generate ORM SQL for common databases

## 配置

在项目`根目录`建立文件`.sqlman.js`

```
module.exports = {
  // sql文件的路径,用于构建一个sql语句缓存集
  // 除此配置之外,还可以手动创建sql语句缓存集
  sqlDir: 'app/sql',
  // 批量处理时，每次提交的条数,默认500
  maxDeal: 500,
  // 数据处理的默认选项,如果不在这里设置此参数,那么实例里写的就是每次执行的默认配置
  defOption: {
    skipUndefined: true,
    skipNull: true,
    skipEmptyString: true
  }
};
```

sql 文件其实是一个 js/ts 文件,导出返回 sql 的函数：

```
// 第一个参数是用来渲染sql、传递到数据库引擎中的，第二个参数是可选的，用来标记本次查询是查询记录数还是全部记录的？

export const select_list = (param: {[key:string]:any}, isCountQuery?: boolean) => {
  return `SELECT * FROM name`;
};
```

## API

### SqlServer

> sql 辅助

#### 文档

| 方法名                 | 说明                                        |
| ---------------------- | ------------------------------------------- |
| insert                 | 插入                                        |
| insertIfNotExists      | 如果不存在再插入                            |
| replace                | 先删除再插入                                |
| insertBatch            | 批量插入                                    |
| insertBatchIfNotExists | 批量:如果不存在再插入                       |
| replaceBatch           | 批量:先删除再插入                           |
| updateById             | 根据主键更新                                |
| updateBatchById        | 批量:根据主键更新，适用于单主键             |
| updateBatch            | 根据指定的条件更新                          |
| deleteBatch            | 根据指定的条件删除                          |
| deleteById             | 根据主键删除,适用于单主键                   |
| deleteByIdMuti         | 根据主键删除,适用于多主键                   |
| selectById             | 根据主键查询,适用于单主键                   |
| selectByIdMuti         | 根据主键查询,适用于多主键                   |
| all                    | 查询全部数据                                |
| allPage                | 查询全部数据,并分页                         |
| allCount               | 查询全部数据记录数                          |
| template               | 根据模板查询数据                            |
| templateOne            | 根据模板查询匹配到的第一条数据              |
| templatePage           | 根据模板查询数据,并分页                     |
| templateCount          | 根据模板查询数据条数                        |
| customQuery            | 自定义查询                                  |
| pageQuery              | 创建分页查询对象                            |
| lambdaQuery            | 创建 lambda 方式查询,匹配的类可以自定义     |
| lambdaQueryMe          | 创建 lambda 方式查询,匹配的类是自己绑定的类 |

#### 实例

### PageQuery

> 分页查询,由`sqlid`加载而来

#### 文档

| 方法名     | 说明                                                   |
| ---------- | ------------------------------------------------------ |
| param      | 设置查询使用的参数                                     |
| params     | 设置查询使用的参数                                     |
| orderBy    | 追加排序字段                                           |
| pageNumber | 设置当前第几页                                         |
| pageSize   | 设置每页多少条                                         |
| limitSelf  | 设置是否自动追加分页语句?否则需要在 sql 语句中自己实现 |
| list       | 返回查询记录的 sql 语句                                |
| count      | 返回查询记录的 sql 语句                                |

#### 实例

### LambdaQuery

> Lambda 查询,支持多个 LambdaQuery 对象组合,支持任意查询条件.支持查询列表、单条记录、条数、修改、删除操作

#### 通过以下方法可以设置查询条件,参数都是 字段名，值

| 方法名          | 说明 |
| --------------- | ---- |
| andEq           |      |
| andNotEq        |      |
| andGreat        |      |
| andLess         |      |
| andLessEq       |      |
| andLike         |      |
| andNotLike      |      |
| andLeftLike     |      |
| andNotLeftLike  |      |
| andRightLike    |      |
| andNotRightLike |      |
| andIsNull       |      |
| andIsNotNull    |      |
| andIn           |      |
| andNotIn        |      |
| andBetween      |      |
| andNotBetween   |      |
| groupBy         |      |

#### 通过以下方法可以设置排序、分组、分页

| 方法名  | 说明 |
| ------- | ---- |
| desc    |      |
| asc     |      |
| groupBy |      |
| limit   |      |

#### 通过以下方法可以设置排序、分组、分页

| 方法名       | 说明                                       |
| ------------ | ------------------------------------------ |
| updateColumn | 如果要更新的话，这里可以设置更新的列、内容 |

#### 通过以下方法可以合并另一个 LambdaQuery 的条件

| and | 以 and 的方式合并另一个 LambdaQuery 的条件 |
| or | 以 or 的方式合并另一个 LambdaQuery 的条件 |

#### 以下方法将终结链条

| where | 返回当前设置的条件 |
| select | 返回查询语句 |
| one | 返回单条查询语句 |
| count | 返回查询记录数的 语句 |
| update | 返回更新语句 |
| delete | 返回删除语句 |

#### 实例

### SqlCache

> sql 语句缓存集

## 注意

1. 所有的方法在接受查询参数时，都是以 `key-value`(`param: {[key:string]:any}`) 的形势接受的。
2. 当使用 `PageQuery` 进行查询时，会多传一个参数：当前查询**是否是记录数查询**，即 `true|false`, true 表示本次查询只查询记录数，而不是实际的数据
3. 第二个参数是可选的，如果你的 sql 不会用作 `PageQuery` 查询，那么就可以忽略这个参数了
4. 参数方式 `WHERE NAME = :param` 声明了一个参数名为 `param`, 这个参数将在最终 sql 执行时 由引擎赋值，可防止 sql 注入
5. 参数方式 `WHERE NAME = '+param.name+'` 直接取方法的参数进行 sql 语句拼接
6. 插入、修改、模板查询方法中，如果参数传入了实体类没有的属性，将被忽略。
