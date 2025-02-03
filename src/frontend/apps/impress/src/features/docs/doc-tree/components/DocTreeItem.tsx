import { useRouter } from 'next/navigation';
import { NodeRendererProps } from 'react-arborist';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box, BoxButton, Icon, StyledLink, Text } from '@/components';
import { TreeViewNode } from '@/components/common/tree/TreeView';
import { useTreeStore } from '@/components/common/tree/treeStore';
import { useCunninghamTheme } from '@/cunningham';
import { useLeftPanelStore } from '@/features/left-panel';

import { useCreateChildrenDoc } from '../api/useCreateChildren';
import { useDocChildren } from '../api/useDocChildren';
import { TreeViewDataType } from '../types/tree';

import Logo from './../assets/doc-s.svg';
import { DocTreeDataType } from './DocTree';

const ItemTextCss = css`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: initial;
  display: -webkit-box;
  line-clamp: 1;
  width: 100%;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
`;

type DocTreeItemProps = NodeRendererProps<TreeViewDataType<DocTreeDataType>>;

export const DocTreeItem = ({ node, ...props }: DocTreeItemProps) => {
  const data = node.data;
  const { updateNode, setSelectedNode } = useTreeStore();
  const { spacingsTokens } = useCunninghamTheme();
  const { refetch } = useDocChildren(
    {
      docId: data.id,
      page: 1,
    },
    { enabled: false },
  );

  const { t } = useTranslation();
  const router = useRouter();
  const { togglePanel } = useLeftPanelStore();
  const { mutate: createChildrenDoc } = useCreateChildrenDoc({
    onSuccess: (doc) => {
      const actualChildren = node.data.children ?? [];
      if (actualChildren.length === 0) {
        loadChildren()
          .then(() => {
            node.open();
            router.push(`/docs/${doc.id}`);
            togglePanel();
          })
          .catch(console.error);
      } else {
        updateNode(node.id, {
          ...node.data,
          children: [...actualChildren, doc],
        });
        node.open();
        router.push(`/docs/${doc.id}`);
        togglePanel();
      }
      setSelectedNode(doc);
    },
  });
  const spacing = spacingsTokens();

  const loadChildren = async () => {
    const data = await refetch();
    console.log(data, node);
    const childs = data.data?.results ?? [];
    const newChilds: TreeViewDataType<DocTreeDataType>[] = childs.map(
      (child) => ({
        ...child,
        childrenCount: child.numchild,
        children: [],
        parentId: node.id,
      }),
    );
    node.data.children = newChilds;
    updateNode(node.id, { ...node.data, children: newChilds });
    return newChilds;
  };

  return (
    <TreeViewNode node={node} {...props} loadChildren={loadChildren}>
      <StyledLink
        onClick={() => {
          setSelectedNode(node.data);
        }}
        href={`/docs/${node.id}`}
        $css={css`
          width: 100%;
        `}
      >
        <Box
          $width="100%"
          $direction="row"
          $gap={spacing['xs']}
          $align="center"
          $css={css`
            .tree-item-actions {
              display: none;
            }
            &:hover {
              .tree-item-actions {
                display: flex;
              }
            }
          `}
        >
          <Box $width={16} $height={16}>
            <Logo />
          </Box>

          <Text $css={ItemTextCss} $size="sm">
            {data.title}
          </Text>
          <Box
            $direction="row"
            $gap={spacing['xs']}
            $align="center"
            className="tree-item-actions"
          >
            <BoxButton
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                createChildrenDoc({
                  title: t('Untitled page'),
                  parentId: node.id,
                });
              }}
              color="primary-text"
            >
              <Icon
                $variation="800"
                $theme="primary"
                isFilled
                iconName="add_box"
              />
            </BoxButton>
          </Box>
        </Box>
      </StyledLink>
    </TreeViewNode>
  );
};
