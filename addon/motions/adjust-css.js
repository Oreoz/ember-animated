import { Motion, rAF, Tween } from 'ember-animated';

export default function adjustCSS(propertyName, sprite, opts) {
  return new AdjustCSS(propertyName, sprite, opts).run();
}

adjustCSS.property = function(propertyName) {
  return this.bind(null, propertyName);
};

export class AdjustCSS extends Motion {
  constructor(propertyName, sprite, opts) {
    super(sprite, opts);
    this.propertyName = propertyName;
    this.prior = null;
    this.tween = null;
  }

  interrupted(motions) {
    this.prior = motions.find(m => m instanceof AdjustCSS && m.propertyName === this.propertyName);
  }

  *animate() {
    let { value: finalValue, unit } = this._splitUnit(this.sprite.finalComputedStyle[this.propertyName]);
    if (this.prior) {

      this.tween = new Tween(
        0,
        finalValue - this.prior.tween.finalValue,
        this.duration,
        this.opts.easing
      ).plus(this.prior.tween);
    } else {
      this.tween = new Tween(
        this._splitUnit(this.sprite.initialComputedStyle[this.propertyName]).value,
        finalValue,
        this.duration,
        this.opts.easing
      );
    }
    while (!this.tween.done) {
      this.sprite.applyStyles({
        [this.propertyName]: `${this.tween.currentValue}${unit}`
      });
      yield rAF();
    }
  }

  _splitUnit(s) {
    if (this.propertyName === 'letter-spacing' && s === 'normal') {
      return {
        value: 0,
        unit: 'px'
      };
    }
    let m = /(\d+(?:\.\d+)?)(\w+)/.exec(s);
    if (!m) {
      throw new Error(`Unable to use adjustCSS for property ${this.propertyName} which has value ${s}`);
    }
    return {
      value: parseFloat(m[1]),
      unit: m[2] || ''
    };
  }
}
