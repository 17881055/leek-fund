/*--------------------------------------------------------------
 *  Copyright (c) Nickbing Lao<giscafer@outlook.com>. All rights reserved.
 *  Licensed under the BSD-3-Clause License.
 *  Github: https://github.com/giscafer
 *-------------------------------------------------------------*/

import { ConfigurationChangeEvent, ExtensionContext, TreeView, window, workspace } from 'vscode';
import { FundProvider } from './explorer/fundProvider';
import { LeekFundModel } from './explorer/model';
import { NewsProvider } from './explorer/newsProvider';
import { LeekFundService } from './explorer/service';
import { StockProvider } from './explorer/stockProvider';
import globalState from './globalState';
import { registerViewEvent } from './registerCommand';
import { SortType } from './shared';
import { StatusBar } from './statusbar/statusBar';
import { isStockTime, isHolidayChina } from './utils';
import { updateAmount } from './webview/setAmount';

let intervalTimer: NodeJS.Timer | null = null;
let fundTreeView: TreeView<any> | null = null;
let stockTreeView: TreeView<any> | null = null;
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('🐥Congratulations, your extension "leek-fund" is now active!');

  isHolidayChina().then((tof) => {
    globalState.isHolidayChina = tof;
  });

  let intervalTime = 3000;
  const model = new LeekFundModel();
  setGlobalVariable(model);
  updateAmount(model);

  const fundService = new LeekFundService(context, model);
  const nodeFundProvider = new FundProvider(fundService);
  const nodeStockProvider = new StockProvider(fundService);
  const newsProvider = new NewsProvider();
  const statusBar = new StatusBar(fundService);

  // prefetch all fund data for searching
  // fundService.getFundSuggestList();

  // create fund & stock side views
  fundTreeView = window.createTreeView('leekFundView.fund', {
    treeDataProvider: nodeFundProvider,
  });
  stockTreeView = window.createTreeView('leekFundView.stock', {
    treeDataProvider: nodeStockProvider,
  });
  window.createTreeView('leekFundView.news', {
    treeDataProvider: newsProvider,
  });

  // fix when TreeView collapse https://github.com/giscafer/leek-fund/issues/31
  const manualRequest = () => {
    fundService.getFundData(model.getConfig('leek-fund.funds'), SortType.NORMAL).then(() => {
      statusBar.refresh();
    });
    fundService.getStockData(model.getConfig('leek-fund.stocks'), SortType.NORMAL).then(() => {
      statusBar.refresh();
    });
  };

  manualRequest();

  // loop
  const loopCallback = () => {
    if (isStockTime()) {
      if (stockTreeView?.visible || fundTreeView?.visible) {
        nodeStockProvider.refresh();
        nodeFundProvider.refresh();
        statusBar.refresh();
      } else {
        manualRequest();
      }
    } else {
      console.log('StockMarket Closed! Polling closed!');
    }
  };

  const setIntervalTime = () => {
    intervalTime = workspace.getConfiguration().get('leek-fund.interval', 10000);

    if (intervalTime < 3000) {
      intervalTime = 3000;
    }
    if (intervalTimer) {
      clearInterval(intervalTimer);
      intervalTimer = null;
    }
    intervalTimer = setInterval(loopCallback, intervalTime);
  };

  setIntervalTime();

  workspace.onDidChangeConfiguration(async (e: ConfigurationChangeEvent) => {
    console.log('🐥>>>Configuration changed');
    setIntervalTime();
    await setGlobalVariable(model);
    nodeFundProvider.refresh();
    nodeStockProvider.refresh();
    newsProvider.refresh();
    statusBar.refresh();
  });

  // register event
  registerViewEvent(context, fundService, nodeFundProvider, nodeStockProvider, newsProvider);
}

function setGlobalVariable(model: LeekFundModel) {
  const iconType = model.getConfig('leek-fund.iconType') || 'arrow';
  globalState.iconType = iconType;
  const fundAmount = model.getConfig('leek-fund.fundAmount') || {};
  globalState.fundAmount = fundAmount;
  const showEarnings = model.getConfig('leek-fund.showEarnings');
  globalState.showEarnings = showEarnings;
}

// this method is called when your extension is deactivated
export function deactivate() {
  console.log('🐥deactivate');
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
}
