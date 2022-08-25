// 将数据转化成响应式的数据，且只能对对象进行代理
import { isObject } from "packages/shared/src";

const enum ReactiveFlags {
  IS_REACTIVE = "__v_isReactive",
}

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
  const proxy = new Proxy(target, {
    // target:目标对象; key:被获取的属性名; receiver:Proxy 或者继承 Proxy 的对象
    get(target, key, receiver) {
      // 去代理的目标对象上取值，走get，可以监控用户取值

      // 当前对象已经被代理过了
      if (key === ReactiveFlags.IS_REACTIVE) {
        return true;
      }

      // !! 不能按下面这种方式去返回值（原因见最后注意事项），而是要用Reflect
      // return target[key]

      return Reflect.get(target, key, receiver);
    },
    set(target, key, value, receiver) {
      // 去代理的目标对象上设置值，走set，可以监控用户设置值

      // !! 不能按下面这种方式去设置值（原因同get），而是要用Reflect
      // target[key] = value;
      // return true;

      return Reflect.set(target, key, value, receiver);
    },
  });

  reactiveMap.set(target, proxy);
  return proxy;
}

// -------------------------------------------注意事项-----------------------------------------------------
// // 1. Proxy的get/set去原对象取值和设置值，都要用Reflect，原因如下

// // 当有一个对象，对象中有get、set这种定义属性方式
// let target = {
//   name: "lcd",
//   get alias() {
//     return this.name;
//   },
// };
// // 思考：当页面中使用了alias对应的值，稍后name值变化了，要重新渲染alias吗？当然要

// const proxyTest = new Proxy(target, {
//   get(target, key, receiver) {
//     // 如果用 return target[key]，那么当调用proxyTest.alias的时候，只会触发一次get
//     // 这是因为this.name中的this指的时target，而target是一个普通对象，不会走到proxyTest中的get中来，相当于没有监控到name属性
//     // 但是按理说get alias的时候，也要触发get name，总共要触发两次proxyTest的get
//     // return target[key]

//     // 所以要用Reflect.get,这时相当于用receiver代替了上面target对象上get alias函数中的this
//     // 所以此时去获取name的值的时候，也会走proxy的get，也会触发get name
//     console.log(key);
//     return Reflect.get(target, key, receiver);
//   },
//   set(target, key, value, receiver) {
//     // 去代理的目标对象上设置值，走set

//     // !! 不能按下面这种方式去设置值（原因同get），而是要用Reflect
//     // target[key] = value;
//     // return true;

//     return Reflect.set(target, key, value, receiver);
//   },
// });

// proxyTest.alias;
