import holidAnalyticsAdapter from 'modules/holidAnalyticsAdapter.js';
import {expect} from 'chai';

describe('holid analytics adapter', function () {
  it('should exist and have required methods', function () {
    expect(holidAnalyticsAdapter.track).to.be.a('function');
    expect(holidAnalyticsAdapter.sendAnalytics).to.be.a('function');
  });

  it('should register the adapter', function () {
    expect(holidAnalyticsAdapter.code).to.equal('holid');
  });
});
