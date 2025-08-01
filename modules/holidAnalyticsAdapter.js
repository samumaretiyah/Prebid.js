import adapter from '../libraries/analyticsAdapter/AnalyticsAdapter.js';
import adapterManager from '../src/adapterManager.js';
import { ajax } from '../src/ajax.js';
import { logInfo } from '../src/utils.js';
import { EVENTS } from '../src/constants.js';

const ANALYTICS_URL = 'https://analytics.holid.io/prebid/';
const END_POINT = "holid.php";

let holidAnalytics = Object.assign(adapter({url: ANALYTICS_URL, analyticsType: 'endpoint'}), {
  context: {},

  track({eventType, args}) {
      switch (eventType) {
        case EVENTS.AUCTION_INIT:
          logInfo('HOLID_AUCTION_INIT:', args);
          this.context[args.auctionId] = {
            auctionId: args.auctionId,
            startTime: args.timestamp,
            bidRequests: [],
            bidResponses: [],
            bidRejected: [],
            bidderDone: [],
            bidTimeout: [],
            winningBids: [],
            adRenderFailed: []
          };
          break;

        case EVENTS.BID_REQUESTED:
          logInfo('HOLID_BID_REQUESTED:', args);
          if (this.context[args.auctionId]) {
            this.context[args.auctionId].bidRequests.push(args);
          }
          break;

        case EVENTS.BID_RESPONSE:
          logInfo('HOLID_BID_RESPONSE:', args);
          if (this.context[args.auctionId]) {
            this.context[args.auctionId].bidResponses.push(args);
          }
          break;

        case EVENTS.BID_REJECTED:
          logInfo('HOLID_BID_REJECTED:', args);
          if (this.context[args.auctionId]) {
            this.context[args.auctionId].bidRejected.push(args);
          }
          break;

        case EVENTS.BIDDER_DONE:
          logInfo('HOLID_BIDDER_DONE:', args);
          if (this.context[args.auctionId]) {
            this.context[args.auctionId].bidderDone.push(args);
          }
          break;
        
        case EVENTS.BID_WON:
          logInfo('HOLID_BID_WON:', args);
          if (this.context[args.auctionId]) {
            this.context[args.auctionId].winningBids.push(args);
          }
          break;

        case EVENTS.AD_RENDER_FAILED:
          if (args?.bid?.auctionId && this.context[args.bid.auctionId]) {
            this.context[args.bid.auctionId].adRenderFailed.push(args);
          }
          break;

        case EVENTS.BID_TIMEOUT:
          logInfo('HOLID_BID_TIMEOUT:', args);
          (args || []).forEach(timeoutBid => {
            if (timeoutBid.auctionId && this.context[timeoutBid.auctionId]) {
              this.context[timeoutBid.auctionId].bidTimeout.push(timeoutBid);
            }
          });
          break;

        case EVENTS.AUCTION_END:
          logInfo('HOLID_AUCTION_END:', args);
          if (this.context[args.auctionId]) {
            // Set a delay, as BID_WON events will come after AUCTION_END events
            setTimeout(() => holidAnalytics.sendAnalyticsEvents(args.auctionId), 1000);
          }
          break;
      }
  }    
});

// save the base class function
holidAnalytics.originEnableAnalytics = holidAnalytics.enableAnalytics;

// override enableAnalytics so we can get access to the config passed in from the page
holidAnalytics.enableAnalytics = function (config) {
  holidAnalytics.originEnableAnalytics(config);
}

holidAnalytics.sendAnalyticsEvents = function(auctionId) {
  const auction = this.context[auctionId];
  if (!auction) return;

  let gdprApplies = auction.bidRequests[0].gdprConsent ? auction.bidRequests[0].gdprConsent.gdprApplies : undefined;
  let gdprConsent = auction.bidRequests[0].gdprConsent ? auction.bidRequests[0].gdprConsent.consentString : undefined;

  if (gdprApplies === true && !gdprConsent) {
    logInfo('Holid Analytics: GDPR applies but no consent string found. Skipping analytics.');
    return;
  }

  const adUnitCodes = [];
  auction.bidRequests.forEach(req => {
    req.bids.forEach(bid => {
      if (!adUnitCodes.includes(bid.adUnitCode)) {
        adUnitCodes.push(bid.adUnitCode);
      }
    });
  });

  // Wait until all adUnitCode divs have iframes rendered inside
  const maxWaitTime = 1000; // in ms
  const intervalTime = 100;
  let elapsed = 0;

  const waitForDOMReady = () => {
    const ready = adUnitCodes.every(adUnitCode => {
      const outerDiv = document.getElementById(adUnitCode);
      return outerDiv && outerDiv.querySelector("div[id^='google_ads_iframe_']");
    });

    if (ready || elapsed >= maxWaitTime) {
      enrichWithPlacementNames(); // extract placement names
      sendPayload();              // send data
    } else {
      elapsed += intervalTime;
      setTimeout(waitForDOMReady, intervalTime);
    }
  };

  const enrichWithPlacementNames = () => {
    auction.bidRequests.forEach(bidRequest => {
      bidRequest.bids.forEach(bid => {
        const adUnitCode = bid.adUnitCode;
        const outerDiv = document.getElementById(adUnitCode);

        if (outerDiv) {
          const childDiv = outerDiv.querySelector("div[id^='google_ads_iframe_']");
          if (childDiv && childDiv.id) {
            const match = childDiv.id.match(/\/21756427176\/(.+?)_0__container__/);
            if (match && match[1]) {
              const placementName = match[1];
              bid.placementName = placementName;
              logInfo(`Holid Analytics: Placement Name for ${adUnitCode}:`, placementName);
            } else {
              logInfo(`Holid Analytics: No placement name matched for ${adUnitCode}.`);
            }
          } else {
            logInfo(`Holid Analytics: No matching child div found in ${adUnitCode}.`);
          }
        } else {
          logInfo(`Holid Analytics: Outer div not found for ${adUnitCode}.`);
        }
      });
    });
  }

  const sendPayload = () => {
    const payload = {
      auctionId: auction.auctionId,
      startTime: auction.startTime,
      bidRequests: auction.bidRequests,
      bidResponses: auction.bidResponses,
      bidRejected: auction.bidRejected,
      bidderDone: auction.bidderDone,
      bidTimeout: auction.bidTimeout,
      winningBids: auction.winningBids,
      adRenderFailed: auction.adRenderFailed,
      userAgent: navigator.userAgent,
      screen: {
        width: screen.width,
        height: screen.height
      }
    }
  
    ajax(ANALYTICS_URL + END_POINT, null, JSON.stringify(payload), {
      method: 'POST'
    });

    logInfo('Holid Analytics: sent payload', payload);
  }

  waitForDOMReady(); // start polling
}

adapterManager.registerAnalyticsAdapter({
  adapter: holidAnalytics,
  code: 'holid'
});

holidAnalytics.enableAnalytics({}); // auto enable

export default holidAnalytics;