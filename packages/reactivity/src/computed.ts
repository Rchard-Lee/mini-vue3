import { isFunction } from "packages/shared/src";
import { ReactiveEffect, trackEffects, triggerEffects } from "./effect";

class ComputedRefImpl {
  public effect;
  // 默认应该取值的时候进行计算
  public _dirty = true;
  public __v_isReadonly = true;
  public __v_isRef = true;
  public _value;
  public dep = new Set();
  constructor(getter, public setter) {
    // 将用户的getters放到effect中进行依赖收集
    this.effect = new ReactiveEffect(getter, () => {
      // 稍后依赖的属性变化会执行此scheduler
      if (!this._dirty) {
        this._dirty = true;
        // 实现一个触发更新，当computed属性发生变化的时候，触发外层effect更新
        triggerEffects(this.dep);
      }
    });
  }

  // 类中的属性访问器 底层就是object.defineProperty
  get value() {
    // 做依赖收集
    trackEffects(this.dep);
    console.log(this.dep);

    if (this._dirty) {
      // 如果值是脏的
      this._dirty = false;
      this._value = this.effect.run();
    }
    return this._value;
  }
  set value(newValue) {
    this.setter(newValue);
  }
}

export const computed = (getterOrOptions) => {
  let onlyGetter = isFunction(getterOrOptions);
  let getter, setter;
  if (onlyGetter) {
    getter = getterOrOptions;
    setter = () => {
      console.warn("no set");
    };
  } else {
    getter = getterOrOptions.get;
    setter = getterOrOptions.set;
  }

  return new ComputedRefImpl(getter, setter);
};
