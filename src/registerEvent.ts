import { commands, ExtensionContext, window } from 'vscode';
import { LeekTreeItem } from './leekTreeItem';
import { LeekFundService } from './service';
import checkForUpdate from './update';
import { colorOptionList, randomColor } from './utils';
import { FundProvider } from './views/fundProvider';
import { LeekFundModel } from './views/model';
import { StockProvider } from './views/stockProvider';
import allFundTrend from './webview/allFundTrend';
import donate from './webview/donate';
import fundFlow from './webview/fundFlow';
import fundHistory from './webview/fundHistory';
import fundRank from './webview/fundRank';
import fundTrend from './webview/fundTrend';
import stockTrend from './webview/stockTrend';

export function registerViewEvent(
  context: ExtensionContext,
  service: LeekFundService,
  fundProvider: FundProvider,
  stockProvider: StockProvider
) {
  const fundModel = new LeekFundModel();

  // Fund operation
  commands.registerCommand('leek-fund.refreshFund', () => {
    fundProvider.refresh();
    const handler = window.setStatusBarMessage(`基金数据已刷新`);
    setTimeout(() => {
      handler.dispose();
    }, 1000);
  });
  commands.registerCommand('leek-fund.deleteFund', (target) => {
    fundModel.removeFundCfg(target.id, () => {
      fundProvider.refresh();
    });
  });
  commands.registerCommand('leek-fund.addFund', () => {
    if (!service.fundSuggestList.length) {
      window.showInformationMessage(`获取基金数据中，请稍后再试`);
      return;
    }

    window
      .showQuickPick(service.fundSuggestList, { placeHolder: '请输入基金代码' })
      .then((code) => {
        if (!code) {
          return;
        }
        fundModel.updateFundCfg(code.split('|')[0], () => {
          fundProvider.refresh();
        });
      });
  });
  commands.registerCommand('leek-fund.sortFund', () => {
    fundProvider.changeOrder();
    fundProvider.refresh();
  });

  // Stock operation
  commands.registerCommand('leek-fund.refreshStock', () => {
    stockProvider.refresh();
    const handler = window.setStatusBarMessage(`股票数据已刷新`);
    setTimeout(() => {
      handler.dispose();
    }, 1000);
  });
  commands.registerCommand('leek-fund.deleteStock', (target) => {
    fundModel.removeStockCfg(target.id, () => {
      stockProvider.refresh();
    });
  });
  commands.registerCommand('leek-fund.addStock', () => {
    // vscode QuickPick 不支持动态查询，只能用此方式解决
    // https://github.com/microsoft/vscode/issues/23633
    const qp = window.createQuickPick();
    qp.items = [{ label: '请输入关键词查询，如：0000001 或 上证指数' }];
    let code: string | undefined;
    let timer: NodeJS.Timer | null = null;
    qp.onDidChangeValue((value) => {
      qp.busy = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      timer = setTimeout(async () => {
        const res = await service.getStockSuggestList(value);
        qp.items = res;
        qp.busy = false;
      }, 100); // 简单防抖
    });
    qp.onDidChangeSelection((e) => {
      if (e[0].description) {
        code = e[0].label && e[0].label.split(' | ')[0];
      }
    });
    qp.show();
    qp.onDidAccept(() => {
      if (!code) {
        return;
      }
      // 存储到配置的时候是接口的参数格式，接口请求时不需要再转换
      const newCode = code.replace('gb', 'gb_').replace('us', 'usr_');
      fundModel.updateStockCfg(newCode, () => {
        stockProvider.refresh();
      });
      qp.hide();
      qp.dispose();
    });
  });
  commands.registerCommand('leek-fund.sortStock', () => {
    stockProvider.changeOrder();
    stockProvider.refresh();
  });

  /**
   * WebView
   */
  // 股票点击
  context.subscriptions.push(
    commands.registerCommand('leet-fund.stockItemClick', (code, name, text, stockCode) =>
      stockTrend(code, name, text, stockCode)
    )
  );
  // 基金点击
  context.subscriptions.push(
    commands.registerCommand('leet-fund.fundItemClick', (code, name) => fundTrend(code, name))
  );
  // 基金右键历史信息点击
  commands.registerCommand('leek-fund.viewFundHistory', (item) => fundHistory(service, item));
  // 基金排行
  commands.registerCommand('leek-fund.viewFundRank', () => fundRank(service));
  // 基金走势图
  commands.registerCommand('leek-fund.viewFundTrend', () => allFundTrend(service));
  // 资金流向
  commands.registerCommand('leek-fund.viewFundFlow', () => fundFlow());
  // 基金置顶
  commands.registerCommand('leek-fund.setFundTop', (target) => {
    fundModel.setFundTopCfg(target.id, () => {
      fundProvider.refresh();
    });
  });
  // 股票置顶
  commands.registerCommand('leek-fund.setStockTop', (target) => {
    fundModel.setStockTopCfg(target.id, () => {
      fundProvider.refresh();
    });
  });

  /**
   * Settings command
   */
  context.subscriptions.push(
    commands.registerCommand('leek-fund.hideText', () => {
      service.toggleLabel();
      fundProvider.refresh();
      stockProvider.refresh();
    })
  );

  context.subscriptions.push(
    commands.registerCommand('leek-fund.setStockStatusBar', () => {
      const stockList = service.stockList;
      const stockNameList = stockList.map((item: LeekTreeItem) => {
        return {
          label: `${item.info.name}`,
          description: `${item.info.code}`,
        };
      });
      window
        .showQuickPick(stockNameList, {
          placeHolder: '输入过滤选择，支持多选（限4个）',
          canPickMany: true,
        })
        .then((res) => {
          if (!res?.length) {
            return;
          }
          let codes = res.map((item) => item.description);
          if (codes.length > 4) {
            codes = codes.slice(0, 4);
          }
          console.log(codes.length);
          fundModel.updateStatusBarStockCfg(codes, () => {
            const handler = window.setStatusBarMessage(`下次数据刷新见效`);
            setTimeout(() => {
              handler.dispose();
            }, 1500);
          });
        });
    })
  );

  context.subscriptions.push(
    commands.registerCommand('leek-fund.setRiseAndFallColor', () => {
      const colorList = colorOptionList();
      window
        .showQuickPick(
          [
            { label: '📈股票涨的颜色', description: 'rise' },
            { label: '📉股票跌的颜色', description: 'fall' },
          ],
          {
            placeHolder: '第一步：选择设置对象',
          }
        )
        .then((item: any) => {
          if (!item) {
            return;
          }

          window
            .showQuickPick(colorList, {
              placeHolder: `第二步：设置颜色（${item.label}）`,
            })
            .then((colorItem: any) => {
              if (!colorItem) {
                return;
              }
              let color = colorItem.description;
              if (color === 'random') {
                color = randomColor();
              }
              fundModel.setConfig(
                item.description === 'rise' ? 'leek-fund.riseColor' : 'leek-fund.fallColor',
                color
              );
            });
        });
    })
  );

  context.subscriptions.push(
    commands.registerCommand('leek-fund.configSetting', () => {
      commands.executeCommand('workbench.action.openSettings', '@ext:giscafer.leek-fund');
    })
  );

  context.subscriptions.push(commands.registerCommand('leek-fund.donate', () => donate()));

  checkForUpdate();
}
