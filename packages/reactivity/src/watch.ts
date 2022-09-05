import { isFunction, isObject } from "packages/shared/src";
import { ReactiveEffect } from "./effect";
import { isReactive } from "./reactive";

function traversal(value, set = new Set()) {
  // 对对象进行循环的时候，一定要考虑有没有循环引用的问题
  if (!isObject) {
    // 递归的终止条件：不是对象
    return value;
  }

  if (set.has(value)) {
    return value;
  }
  set.add(value);
  for (let key in value) {
    traversal(value[key], set);
  }
  return value;
}

// source 是用户传入的对象，cb就是对应的用户的回调
export function watch(source, cb) {
  let getter;

  // 看下数据是不是响应式的
  if (isReactive(source)) {
    // 对用户传入的数据进行递归循环，只要循环就会访问对象上的每一个属性
    // 访问属性的时候会收集effect（也就是watch）
    getter = () => traversal(source);
  } else if (isFunction(source)) {
    getter = source;
  } else {
    return;
  }
  let cleanup;
  const onCleanup = (fn) => {
    cleanup = fn;
  };
  let oldValue;
  const job = () => {
    if (cleanup) {
      // 下一次watch触发上一次watch的清理
      cleanup();
    }
    const newValue = effect.run();
    cb(newValue, oldValue, onCleanup);
    oldValue = newValue;
  };

  // 在effect中访问属性就会依赖收集
  // 监控自己构造的函数，变化后重新执行job
  const effect = new ReactiveEffect(getter, job);

  oldValue = effect.run();
}
