import { moduleForComponent, test, skip } from 'ember-qunit';
import hbs from 'htmlbars-inline-precompile';
import Ember from 'ember';
import { equalBounds, visuallyConstant } from '../../helpers/assertions';
import { task } from 'ember-concurrency';
import Motion from 'ember-animated/motion';
import {
  macroWait,
  waitForAnimations
} from 'ember-animated/test-helpers';


moduleForComponent('animated-container', 'Integration | Component | animated container', {
  integration: true,
  beforeEach(assert) {
    assert.equalBounds = equalBounds;
    assert.visuallyConstant = visuallyConstant;
    let here = this;
    this.waitForAnimations = waitForAnimations;
    this.register('component:fake-animator', Ember.Component.extend({
      motionService: Ember.inject.service('-ea-motion'),
      init() {
        this._super();
        here.set('fakeAnimator', this);
        this.get('motionService').register(this);
      },
      didInsertElement() {
        if (this.onInitialRender) {
          this.get('animate').perform(this.onInitialRender);
        }
      },
      beginStaticMeasurement() {
        this.$().height(this.staticHeight);
      },
      endStaticMeasurement() {
        this.$().height(this.initialHeight);
      },
      animate: task(function * (opts={}) {

        // In a typical well-behaved animation, the static height *is*
        // the final height. But we distinguish the two here in order
        // to make it easier to observe the effect of the container
        // unlocking itself.

        this.initialHeight = opts.initialHeight == null ? 0 : opts.initialHeight;
        this.staticHeight = opts.staticHeight == null ? 100 : opts.staticHeight;
        this.finalHeight = opts.finalHeight == null ? 200 : opts.finalHeight;

        this.$().height(this.initialHeight);
        let service = this.get('motionService');
        service.willAnimate({
          duration: opts.duration == null ? 1 : opts.duration,
          task: this.get('animate.last')
        });
        yield * service.staticMeasurement(() => {})
        this.$().height(this.finalHeight);
        if (opts.block) {
          yield opts.block;
        }
      })
    }));
  }
});

test('simple render', function(assert) {
  this.render(hbs`
    {{#animated-container}}
      <div class="inside">
        {{fake-animator}}
      </div>
    {{/animated-container}}
  `);

  this.$('.inside').css({
    height: 210
  });

  let container = bounds(this.$('.animated-container'));
  let inside = bounds(this.$('.inside'));
  assert.equalBounds(container, inside, 'takes size of content');

  this.$('.inside').css({
    height: 600
  });

  container = bounds(this.$('.animated-container'));
  let tallerInside = bounds(this.$('.inside'));
  assert.equalBounds(container, tallerInside, 'adapts to height of content');
  assert.ok(tallerInside.height > inside.height, "inside content got taller");

});

test('locks size', function(assert) {
  this.render(hbs`
    {{#animated-container}}
      <div class="inside">
        {{fake-animator}}
      </div>
    {{/animated-container}}
  `);

  this.$('.inside').css({
    height: 210
  });

  let original = bounds(this.$('.animated-container'));


  Ember.run(() => {
    this.get('fakeAnimator.animate').perform();
  });

  this.$('.inside').css({
    height: 600
  });

  let final = bounds(this.$('.animated-container'));

  assert.equalBounds(final, original, 'height can be locked');
});

test('measures at the appropriate time', function(assert) {
  let motionSawHeight;

  this.set('TestMotion', class extends Motion {
    *animate() {
      motionSawHeight = this.sprite.finalBounds.height;
    }
  });

  this.render(hbs`
    {{#animated-container motion=TestMotion}}
      <div class="inside">
        {{fake-animator}}
      </div>
    {{/animated-container}}
  `);

  Ember.run(() => {
    this.get('fakeAnimator.animate').perform({
      staticHeight: 321
    });
  });

  return this.waitForAnimations().then(() => {
    assert.equal(motionSawHeight, 321);
  });
});

test('unlocks only after own motion is done', function(assert) {
  let finishMotion;

  this.set('TestMotion', class extends Motion {
    *animate() {
      yield new Ember.RSVP.Promise(resolve => {
        finishMotion = resolve;
      });
    }
  });

  this.render(hbs`
    {{#animated-container motion=TestMotion}}
      <div class="inside">
        {{fake-animator}}
      </div>
    {{/animated-container}}
  `);

  Ember.run(() => {
    this.get('fakeAnimator.animate').perform({
      initialHeight: 100,
      staticHeight: 200,
      finalHeight: 300
    });
  });
  return macroWait().then(() => {
    assert.equal(height(this.$('.animated-container')), 100, "still at previous height");
    finishMotion();
    return this.waitForAnimations();
  }).then(() => {
    assert.equal(height(this.$('.animated-container')), 300, "now at final height");
  });
});

// This is failing due to https://github.com/machty/ember-concurrency/pull/109
skip('unlocks only after animator\'s motion is done', function(assert) {
  let unblock;
  let block = new Ember.RSVP.Promise(resolve => unblock = resolve);

  this.set('TestMotion', class extends Motion {
    *animate() {}
  });

  this.render(hbs`
    {{#animated-container motion=TestMotion}}
      <div class="inside">
        {{fake-animator}}
      </div>
    {{/animated-container}}
  `);

  this.$('.inside').css({
    height: 200
  });

  Ember.run(() => {
    this.get('fakeAnimator.animate').perform({
      block,
      initialHeight: 100,
      staticHeight: 200,
      finalHeight: 300
    });
  });

  return macroWait().then(() => {
    assert.equal(height(this.$('.animated-container')), 100, "still at previous height");
    unblock();
    return macroWait();
  }).then(() => {
    assert.equal(height(this.$('.animated-container')), 300, "now at final height");
  });
});

test('passes provided duration to motion', function(assert) {
  let motionOpts;
  this.set('TestMotion', class extends Motion {
    *animate() {
      motionOpts = this.opts;
    }
  });

  this.render(hbs`
    {{#animated-container motion=TestMotion}}
      <div class="inside">
        {{fake-animator}}
      </div>
    {{/animated-container}}
  `);

  Ember.run(() => {
    this.get('fakeAnimator.animate').perform({
      duration: 456
    });
  });

  return this.waitForAnimations().then(() => {
    assert.deepEqual(motionOpts, { duration: 456 });
  });
});

test('can animate initial render', function(assert) {
  assert.expect(3);

  this.set('TestMotion', class extends Motion {
    *animate() {
      assert.equal(this.sprite.initialBounds.height, 0, 'initial height');
      assert.equal(this.sprite.finalBounds.height, 100, 'static height');
    }
  });

  this.set('opts', {
    initialHeight: 0,
    staticHeight: 100,
    finalHeight: 200
  });
  this.render(hbs`
    {{#animated-container motion=TestMotion onInitialRender=true}}
      {{fake-animator onInitialRender=opts}}
    {{/animated-container}}
  `);

  return this.waitForAnimations().then(() => {
    assert.equal(height(this.$('.animated-container')), 200, 'ends up unlocked');
  });
});

// I think this is failing due to https://github.com/machty/ember-concurrency/pull/109
skip('locks on initial render even when not animating', function(assert) {
  let unblock;
  let block = new Ember.RSVP.Promise(resolve => unblock = resolve);
  let motionRan = false;

  this.set('TestMotion', class extends Motion {
    *animate() {
      motionRan = true;
    }
  });

  this.set('opts', {
    initialHeight: 0,
    staticHeight: 100,
    finalHeight: 200,
    block
  });
  this.render(hbs`
    {{#animated-container motion=TestMotion}}
      {{fake-animator onInitialRender=opts}}
    {{/animated-container}}
  `);

  return macroWait().then(() => {
    assert.equal(height(this.$('.animated-container')), 0, 'initial height');
    unblock();
    return this.waitForAnimations();
  }).then(() => {
    assert.equal(height(this.$('.animated-container')), 200, 'ends up unlocked');
    assert.ok(!motionRan, 'motion did not run');
  });
});


test("Accounts for top margin collapse between self and child", function(assert) {
  this.render(hbs`
    {{#animated-container}}
      <div class="inside" style="margin-top: 10px; height: 100px;">
        {{fake-animator}}
      </div>
    {{/animated-container}}
  `);

  assert.visuallyConstant(this.$('.animated-container'), () => {
    Ember.run(() => {
      this.get('fakeAnimator.animate').perform();
    });
    this.$('.inside').css('position', 'absolute');
  });
});

test("Accounts for top margin collapse between self and descendant", function(assert) {
  this.render(hbs`
    {{#animated-container}}
      <div class="inside">
        <div style="margin-top: 10px; height: 100px;"></div>
        {{fake-animator}}
      </div>
    {{/animated-container}}
  `);

  assert.visuallyConstant(this.$('.animated-container'), () => {
    Ember.run(() => {
      this.get('fakeAnimator.animate').perform();
    });
    this.$('.inside').css('position', 'absolute');
  });
});

test("No top margin collapse when we have a border", function(assert) {
  this.render(hbs`
    {{#animated-container style="border: 1px solid black"}}
      <div class="inside" style="margin-top: 10px; height: 100px;">
        {{fake-animator}}
      </div>
    {{/animated-container}}
  `);

  assert.visuallyConstant(this.$('.animated-container'), () => {
    Ember.run(() => {
      this.get('fakeAnimator.animate').perform();
    });
    this.$('.inside').css('position', 'absolute');
  });
});

test("No top margin collapse when our margin already exceeds child's", function(assert) {
  this.render(hbs`
    {{#animated-container style="margin-top: 11px"}}
      <div class="inside" style="margin-top: 10px; height: 100px;">
        {{fake-animator}}
      </div>
    {{/animated-container}}
  `);

  assert.visuallyConstant(this.$('.animated-container'), () => {
    Ember.run(() => {
      this.get('fakeAnimator.animate').perform();
    });
    this.$('.inside').css('position', 'absolute');
  });
});


test("Accounts for bottom margin collapse between self and child", function(assert) {
  this.render(hbs`
    <div style="border: 1px solid black">
      {{#animated-container}}
        <div class="inside" style="margin-bottom: 10px; height: 100px;">
          {{fake-animator}}
        </div>
      {{/animated-container}}
      <div class="after">This comes after</div>
    </div>
  `);

  assert.visuallyConstant(this.$('.after'), () => {
    Ember.run(() => {
      this.get('fakeAnimator.animate').perform();
    });
    this.$('.inside').css('position', 'absolute');
  });
});


test("Accounts for own margin collapse as first content appears", function(assert) {
  assert.expect(1);

  this.render(hbs`
    <style type="text/css">
      .example {
        margin-top: 10px;
        margin-bottom: 20px;
      }
    </style>
    {{#animated-container class="example"}}
      {{fake-animator}}
    {{/animated-container}}
    <div class="after">This comes after</div>
  `);

  this.get('fakeAnimator').$().height(0);

  let initialTop = bounds(this.$('.after')).top;

  this.get('fakeAnimator.animate').perform({
    initialHeight: 0,
    staticHeight: 1,
    finalHeight: 1
  });

  return this.waitForAnimations().then(() => {
    assert.equal(bounds(this.$('.after')).top, initialTop + 1, 'only changes by one pixel');
  });
});

test("Accounts for own margin collapse as last content is removed", function(assert) {
  assert.expect(1);

  this.render(hbs`
    <style type="text/css">
      .example {
        margin-top: 10px;
        margin-bottom: 20px;
      }
    </style>
    {{#animated-container class="example"}}
      {{fake-animator}}
    {{/animated-container}}
    <div class="after">This comes after</div>
  `);

  this.get('fakeAnimator').$().height(1);

  let initialTop = bounds(this.$('.after')).top;

  this.get('fakeAnimator.animate').perform({
    initialHeight: 1,
    staticHeight: 0,
    finalHeight: 0
  });

  return this.waitForAnimations().then(() => {
    assert.equal(bounds(this.$('.after')).top, initialTop - 1, 'only changes by one pixel');
  });
});

function bounds($elt) {
  return $elt[0].getBoundingClientRect();
}

function height($elt) {
  return bounds($elt).height;
}
