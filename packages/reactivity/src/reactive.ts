// 将数据转化成响应式的数据，且只能对对象进行代理
import { isObject } from "packages/shared/src";
import { mutableHandlers, ReactiveFlags } from "./baseHandler";

// 这个WeakMap的作用是对代理对象进行缓存，防止传入相同的对象但是重复创建proxy去代理
// 之所以使用weakMap是为了防止内存泄露，它的key只能是对象
const reactiveMap = new WeakMap();
export function reactive(target) {
  // 判断传入的参数是不是一个对象
  if (!isObject(target)) {
    return;
  }

  // 如果当前target对象已经创建过了proxy，直接返回之前的proxy
  // 如：const a = reactive(data), 之后又执行const b = reactive(data), 这时他们应该得到的是同一个proxy
  let existingProxy = reactiveMap.get(target);
  if (existingProxy) {
    return existingProxy;
  }

  // 防止循环嵌套代理（代理对象又被代理），比如const proxy1 = reactive(data), const proxy2 = reactive(proxy1), 这时直接返回proxy1
  if (target[ReactiveFlags.IS_REACTIVE]) {
    return target;
  }

  // 并没有重新定义属性，只是代理，当取值的时候会调用get，当赋值的时候会调用set
  const proxy = new Proxy(target, mutableHandlers);

  reactiveMap.set(target, proxy);
  return proxy;
}
